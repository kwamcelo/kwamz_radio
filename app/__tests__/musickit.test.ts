import type { MusicKit } from "../modules/kwamz-musickit";
import { MusicKitPlayer } from "../src/player/musickit";
import { PlayerUnavailable, type PlayerEvent } from "../src/player/types";
import { song } from "../test-utils";

type Listeners = Record<string, (event: never) => void>;

function fakeNative(overrides: Partial<Record<keyof MusicKit, unknown>> = {}) {
  const listeners: Listeners = {};
  const native = {
    authorizationStatus: jest.fn(() => "authorized"),
    requestAuthorization: jest.fn(async () => "authorized"),
    canPlayCatalogContent: jest.fn(async () => true),
    setQueue: jest.fn(async (ids: string[]) => ids),
    play: jest.fn(async () => {}),
    pause: jest.fn(async () => {}),
    skipToNext: jest.fn(async () => {}),
    skipToPrevious: jest.fn(async () => {}),
    seek: jest.fn(async () => {}),
    getPositionMs: jest.fn(() => 1234),
    addListener: jest.fn((name: string, fn: (event: never) => void) => {
      listeners[name] = fn;
      return { remove: () => delete listeners[name] };
    }),
    ...overrides,
  };
  return { native: native as unknown as MusicKit, mock: native, listeners };
}

test("asks for Apple Music permission on first load only", async () => {
  const { native, mock } = fakeNative({ authorizationStatus: jest.fn(() => "notDetermined") });
  await new MusicKitPlayer(native).load([song("A")], 0);
  expect(mock.requestAuthorization).toHaveBeenCalledTimes(1);

  const { native: granted, mock: grantedMock } = fakeNative();
  await new MusicKitPlayer(granted).load([song("A")], 0);
  expect(grantedMock.requestAuthorization).not.toHaveBeenCalled();
});

test("denied permission or no subscription makes the player unavailable", async () => {
  const denied = fakeNative({ authorizationStatus: jest.fn(() => "denied") }).native;
  await expect(new MusicKitPlayer(denied).load([song("A")], 0)).rejects.toThrow(
    PlayerUnavailable,
  );

  const noSub = fakeNative({ canPlayCatalogContent: jest.fn(async () => false) }).native;
  await expect(new MusicKitPlayer(noSub).load([song("A")], 0)).rejects.toThrow(/subscription/);
});

test("without the native module, playback is unavailable", async () => {
  await expect(new MusicKitPlayer(null).load([song("A")], 0)).rejects.toThrow(PlayerUnavailable);
});

test("queues only songs with an Apple id, keeping the chosen start song", async () => {
  const a = song("A");
  const noApple = song("No Apple", { apple_id: null });
  const c = song("C");
  const d = song("D");
  const { native, mock } = fakeNative({
    // The storefront doesn't have C.
    setQueue: jest.fn(async (ids: string[]) => ids.filter((id) => id !== c.apple_id)),
  });

  const loaded = await new MusicKitPlayer(native).load([a, noApple, c, d], 3);

  expect(mock.setQueue).toHaveBeenCalledWith([a.apple_id, c.apple_id, d.apple_id], 2);
  expect(loaded).toEqual([a, d]);
});

test("native events become Player events with song ids", async () => {
  const a = song("A");
  const { native, listeners } = fakeNative();
  const player = new MusicKitPlayer(native);
  await player.load([a], 0);
  const events: PlayerEvent[] = [];
  const unsubscribe = player.subscribe((e) => events.push(e));

  listeners.onPlaybackStateChange({ status: "playing" } as never);
  listeners.onNowPlayingChange({ appleId: a.apple_id } as never);
  listeners.onNowPlayingChange({ appleId: null } as never);
  unsubscribe();

  expect(events).toEqual([
    { type: "status", status: "playing" },
    { type: "track", songId: a.id },
    { type: "track", songId: null },
  ]);
  expect(Object.keys(listeners)).toHaveLength(0);
});

test("controls pass through to the native player", async () => {
  const { native, mock } = fakeNative();
  const player = new MusicKitPlayer(native);

  await player.play();
  await player.pause();
  await player.next();
  await player.seek(5000);

  expect(mock.play).toHaveBeenCalled();
  expect(mock.pause).toHaveBeenCalled();
  expect(mock.skipToNext).toHaveBeenCalled();
  expect(mock.seek).toHaveBeenCalledWith(5000);
  expect(player.positionMs()).toBe(1234);
});
