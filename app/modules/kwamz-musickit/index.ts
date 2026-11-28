// JS face of the native KwamzMusicKit module (ios/KwamzMusicKitModule.swift).
// Null where the native code is absent: Android, Expo Go, web and Jest.
import { requireOptionalNativeModule, type NativeModule } from "expo";

export type AuthorizationStatus = "authorized" | "denied" | "restricted" | "notDetermined";
export type PlaybackStatus = "playing" | "paused" | "stopped";

type Events = {
  onPlaybackStateChange(event: { status: PlaybackStatus }): void;
  onNowPlayingChange(event: { appleId: string | null }): void;
};

declare class KwamzMusicKitModule extends NativeModule<Events> {
  authorizationStatus(): AuthorizationStatus;
  requestAuthorization(): Promise<AuthorizationStatus>;
  canPlayCatalogContent(): Promise<boolean>;
  /** Resolves to the ids that were queued; songs missing from the storefront are dropped. */
  setQueue(appleIds: string[], startIndex: number): Promise<string[]>;
  play(): Promise<void>;
  pause(): Promise<void>;
  skipToNext(): Promise<void>;
  skipToPrevious(): Promise<void>;
  seek(positionMs: number): Promise<void>;
  getPositionMs(): number;
}

export type MusicKit = KwamzMusicKitModule;

export default requireOptionalNativeModule<KwamzMusicKitModule>("KwamzMusicKit");
