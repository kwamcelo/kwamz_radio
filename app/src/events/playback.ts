// Turns what the Player reports into raw listening events. Labels (good skip, bad skip,
// ...) are derived at training time; this only records what happened.
import type { Radio, Song } from "../api/client";
import type { Player, PlayerStatus } from "../player/types";
import type { LoggedEvent } from "./logger";

export const TICK_MS = 1_000;
export const PROGRESS_EVERY_MS = 10_000;
/** A position jump this much beyond the time that passed counts as a seek. */
const SEEK_THRESHOLD_MS = 3_000;
/** Ending this close to the song's end counts as completing it. */
const COMPLETE_WITHIN_MS = 5_000;
/** The player reports "paused" for a moment while changing songs: only a pause that
 * lasts this long is logged. */
export const PAUSE_SETTLE_MS = 1_000;

type Current = {
  song: Song;
  started: boolean;
  positionMs: number;
  sinceProgressMs: number;
};

export class PlaybackTracker {
  private radio: Radio | null = null;
  private positions = new Map<string, number>();
  private songs = new Map<string, Song>();
  private current: Current | null = null;
  private status: PlayerStatus = "idle";
  private skipRequested = false;
  private pendingPause: { song: Song; positionMs: number; at: number } | null = null;
  private lastTick = 0;
  private interval: ReturnType<typeof setInterval> | null = null;
  private unsubscribe: (() => void) | null = null;

  constructor(
    private readonly player: Player,
    private readonly log: (event: LoggedEvent) => void,
    private readonly now: () => number = Date.now,
  ) {}

  /**
   * Call before loading `radio` into the player. Finishes the song that was playing, and
   * keeps listening to the player (it only reports changes, so a listener that starts
   * late misses what's already playing).
   */
  begin(radio: Radio): void {
    if (this.current) this.finish(this.current);
    this.current = null;
    this.skipRequested = false;
    this.pendingPause = null;
    this.radio = radio;
    this.positions = new Map(radio.tracks.map((t) => [t.song.id, t.position]));
    this.songs = new Map(radio.tracks.map((t) => [t.song.id, t.song]));
    if (!this.unsubscribe) {
      this.unsubscribe = this.player.subscribe((event) => {
        if (event.type === "status") this.onStatus(event.status);
        else this.onTrack(event.songId);
      });
    }
    if (!this.interval) this.interval = setInterval(() => this.tick(), TICK_MS);
    this.lastTick = this.now();
  }

  /** After loading: `loaded` is what the player accepted; the rest are unavailable. */
  loaded(loaded: Song[]): void {
    const playable = new Set(loaded.map((s) => s.id));
    for (const track of this.radio?.tracks ?? []) {
      if (!playable.has(track.song.id)) this.emit("unavailable", track.song, 0);
    }
  }

  /** Stop listening altogether (sign-out). */
  stop(): void {
    if (this.current) this.finish(this.current);
    this.current = null;
    this.skipRequested = false;
    this.unsubscribe?.();
    this.unsubscribe = null;
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
    this.status = "idle";
    this.pendingPause = null;
  }

  /** The next song change was asked for in the app (the Next button). */
  markSkip(): void {
    this.skipRequested = true;
  }

  /** Song id and position of what's playing now, for feedback events. */
  playing(): { songId: string; positionMs: number } | null {
    if (!this.current) return null;
    return { songId: this.current.song.id, positionMs: this.player.positionMs() };
  }

  /** Common fields for an event about `song` in the tracked radio. */
  context(song: Song): Pick<LoggedEvent, "radio_id" | "radio_position" | "provider"> {
    return {
      radio_id: this.radio?.id ?? null,
      radio_position: this.positions.get(song.id) ?? null,
      provider: this.player.provider,
    };
  }

  private onStatus(status: PlayerStatus): void {
    const was = this.status;
    this.status = status;
    if (status === "playing") {
      this.pendingPause = null;
      this.lastTick = this.now();
      if (this.current && !this.current.started) this.playStart(this.current);
    } else if (was === "playing" && status === "paused" && this.current) {
      this.current.positionMs = this.player.positionMs();
      this.pendingPause = {
        song: this.current.song,
        positionMs: this.current.positionMs,
        at: this.now(),
      };
    }
  }

  private onTrack(songId: string | null): void {
    if (this.current?.song.id === songId) return;
    this.pendingPause = null; // it was the song change, not the user
    if (this.current) this.finish(this.current);
    const song = songId ? this.songs.get(songId) : undefined;
    this.current = song ? { song, started: false, positionMs: 0, sinceProgressMs: 0 } : null;
    this.lastTick = this.now();
    if (this.current && this.status === "playing") this.playStart(this.current);
  }

  private playStart(current: Current): void {
    current.started = true;
    this.emit("play_start", current.song, 0);
  }

  /** The song stopped being current: it either ran to the end or was skipped. */
  private finish(current: Current): void {
    const requested = this.skipRequested;
    this.skipRequested = false;
    if (!current.started) return;
    const duration = current.song.duration_ms;
    const completed =
      duration != null ? current.positionMs >= duration - COMPLETE_WITHIN_MS : !requested;
    if (completed) this.emit("complete", current.song, current.positionMs);
    else {
      this.emit("skip", current.song, current.positionMs, {
        source: requested ? "app" : "system", // system: lock screen, headphones, ...
      });
    }
  }

  private tick(): void {
    const now = this.now();
    const elapsed = now - this.lastTick;
    this.lastTick = now;
    const pause = this.pendingPause;
    if (pause && now - pause.at >= PAUSE_SETTLE_MS) {
      this.pendingPause = null;
      this.emit("pause", pause.song, pause.positionMs);
    }
    const current = this.current;
    if (!current || this.status !== "playing") return;
    const position = this.player.positionMs();
    const expected = current.positionMs + elapsed;
    if (Math.abs(position - expected) > SEEK_THRESHOLD_MS) {
      this.emit("seek", current.song, position, { from_ms: Math.round(current.positionMs) });
    } else {
      current.sinceProgressMs += elapsed;
      if (current.sinceProgressMs >= PROGRESS_EVERY_MS) {
        current.sinceProgressMs = 0;
        this.emit("progress", current.song, position);
      }
    }
    current.positionMs = position;
  }

  private emit(
    type: LoggedEvent["type"],
    song: Song,
    positionMs: number,
    payload?: Record<string, unknown>,
  ): void {
    this.log({
      type,
      song_id: song.id,
      position_ms: Math.max(0, Math.round(positionMs)),
      ...this.context(song),
      ...(payload ? { payload } : {}),
    });
  }
}
