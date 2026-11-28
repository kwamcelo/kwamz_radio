import nativeMusicKit, { type MusicKit as Native } from "../../modules/kwamz-musickit";
import type { Song } from "../api/client";
import { PlayerUnavailable, type Player, type PlayerEvent } from "./types";

/** Apple Music through the native KwamzMusicKit module. */
export class MusicKitPlayer implements Player {
  readonly provider = "apple" as const;
  /** apple_id -> song id, for the queue that is loaded now. */
  private songIds = new Map<string, string>();

  constructor(private readonly native: Native | null = nativeMusicKit) {}

  private get kit(): Native {
    if (!this.native) throw new PlayerUnavailable("Apple Music playback needs the iOS app");
    return this.native;
  }

  /** Apple Music asks for permission on first playback, not at sign-up. */
  private async authorize(): Promise<void> {
    const kit = this.kit;
    let status = kit.authorizationStatus();
    if (status === "notDetermined") status = await kit.requestAuthorization();
    if (status !== "authorized") {
      throw new PlayerUnavailable("Allow kwamz radio to use Apple Music in Settings to play");
    }
    if (!(await kit.canPlayCatalogContent())) {
      throw new PlayerUnavailable("Playing needs an Apple Music subscription");
    }
  }

  async load(songs: Song[], startIndex: number): Promise<Song[]> {
    await this.authorize();
    const playable = songs.filter((s) => s.apple_id);
    const start = songs[startIndex]?.apple_id ?? null;
    const startAt = Math.max(
      0,
      playable.findIndex((s) => s.apple_id === start),
    );
    const queued = new Set(
      await this.kit.setQueue(
        playable.map((s) => s.apple_id as string),
        startAt,
      ),
    );
    const loaded = playable.filter((s) => queued.has(s.apple_id as string));
    this.songIds = new Map(loaded.map((s) => [s.apple_id as string, s.id]));
    return loaded;
  }

  play = () => this.kit.play();
  pause = () => this.kit.pause();
  seek = (positionMs: number) => this.kit.seek(positionMs);
  next = () => this.kit.skipToNext();
  positionMs = () => this.native?.getPositionMs() ?? 0;

  async addToLibrary(song: Song): Promise<void> {
    if (!song.apple_id) throw new PlayerUnavailable("This song isn't on Apple Music");
    await this.authorize();
    await this.kit.addToLibrary(song.apple_id);
  }

  subscribe(listener: (event: PlayerEvent) => void): () => void {
    const kit = this.native;
    if (!kit) return () => {};
    const subs = [
      kit.addListener("onPlaybackStateChange", ({ status }) =>
        listener({ type: "status", status }),
      ),
      kit.addListener("onNowPlayingChange", ({ appleId }) =>
        listener({ type: "track", songId: appleId ? (this.songIds.get(appleId) ?? null) : null }),
      ),
    ];
    return () => subs.forEach((s) => s.remove());
  }
}
