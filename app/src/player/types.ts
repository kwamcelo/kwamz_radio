// The playback seam. MusicKitPlayer implements it now; D1 adds a YouTube player.
import type { Song } from "../api/client";

export type PlaybackProvider = "apple" | "youtube";

/** "idle": nothing loaded yet. */
export type PlayerStatus = "idle" | "playing" | "paused" | "stopped";

export type PlayerEvent =
  | { type: "status"; status: PlayerStatus }
  /** The song now at the head of the queue (null when the queue is empty or ended). */
  | { type: "track"; songId: string | null };

export interface Player {
  readonly provider: PlaybackProvider;
  /**
   * Replaces the queue with `songs`, starting at `startIndex`. Resolves to the songs
   * that can actually play on this provider, in order; the rest are skipped.
   * May ask the user for permission (e.g. Apple Music) the first time.
   */
  load(songs: Song[], startIndex: number): Promise<Song[]>;
  play(): Promise<void>;
  pause(): Promise<void>;
  seek(positionMs: number): Promise<void>;
  next(): Promise<void>;
  positionMs(): number;
  /** Returns an unsubscribe function. */
  subscribe(listener: (event: PlayerEvent) => void): () => void;
}

/** The provider can't play at all here (no permission, no subscription, no native code). */
export class PlayerUnavailable extends Error {}
