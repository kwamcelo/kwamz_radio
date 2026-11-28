import type { LoggedEvent } from "../src/events/logger";
import {
  PAUSE_SETTLE_MS,
  PlaybackTracker,
  PROGRESS_EVERY_MS,
  TICK_MS,
} from "../src/events/playback";
import { FakePlayer, radio as makeRadio } from "../test-utils";

function setup({ durationMs = 180_000 } = {}) {
  jest.useFakeTimers();
  let clock = 0;
  const player = new FakePlayer();
  const logged: LoggedEvent[] = [];
  const tracker = new PlaybackTracker(player, (e) => logged.push(e), () => clock);
  const radio = makeRadio(5);
  radio.tracks.forEach((t) => (t.song.duration_ms = durationMs));
  const songs = radio.tracks.map((t) => t.song);

  /** Advance the clock and the player by `ms` of playback. */
  function play(ms: number) {
    for (let t = 0; t < ms; t += TICK_MS) {
      clock += TICK_MS;
      player.position += TICK_MS;
      jest.advanceTimersByTime(TICK_MS);
    }
  }
  /** Let time pass without the song moving (paused). */
  function wait(ms: number) {
    for (let t = 0; t < ms; t += TICK_MS) {
      clock += TICK_MS;
      jest.advanceTimersByTime(TICK_MS);
    }
  }
  function startSong(index: number) {
    player.position = 0;
    player.emit({ type: "track", songId: songs[index].id });
  }
  const types = () => logged.map((e) => e.type);
  return { player, tracker, radio, songs, logged, play, wait, startSong, types };
}

afterEach(() => jest.useRealTimers());

test("a song that plays to the end logs play_start, progress and complete", () => {
  const { player, tracker, radio, songs, logged, play, startSong, types } = setup({
    durationMs: 25_000,
  });
  tracker.begin(radio);
  tracker.loaded(songs);
  player.emit({ type: "status", status: "playing" });
  startSong(0);

  play(25_000);
  startSong(1);

  expect(types()).toEqual(["play_start", "progress", "progress", "complete", "play_start"]);
  expect(logged[0]).toEqual({
    type: "play_start",
    song_id: songs[0].id,
    position_ms: 0,
    radio_id: radio.id,
    radio_position: 0,
    provider: "apple",
  });
  expect(logged[1].position_ms).toBe(PROGRESS_EVERY_MS);
  expect(logged[4]).toMatchObject({ song_id: songs[1].id, radio_position: 1 });
});

test("Next in the app logs a skip with where it happened", () => {
  const { player, tracker, radio, songs, logged, play, startSong } = setup();
  tracker.begin(radio);
  tracker.loaded(songs);
  player.emit({ type: "status", status: "playing" });
  startSong(2);
  play(7_000);

  tracker.markSkip();
  startSong(3);

  expect(logged.at(-2)).toMatchObject({
    type: "skip",
    song_id: songs[2].id,
    position_ms: 7_000,
    radio_position: 2,
    payload: { source: "app" },
  });
});

test("skipping from the lock screen is a skip too", () => {
  const { player, tracker, radio, songs, logged, play, startSong } = setup();
  tracker.begin(radio);
  tracker.loaded(songs);
  player.emit({ type: "status", status: "playing" });
  startSong(0);
  play(40_000);

  startSong(1); // no markSkip: the change came from outside the app

  expect(logged.at(-2)).toMatchObject({ type: "skip", payload: { source: "system" } });
});

test("pause and seeks are logged", () => {
  const { player, tracker, radio, songs, logged, play, wait, startSong, types } = setup();
  tracker.begin(radio);
  tracker.loaded(songs);
  player.emit({ type: "status", status: "playing" });
  startSong(0);
  play(3_000);

  player.position = 60_000; // scrubbed on the lock screen
  play(1_000);
  player.emit({ type: "status", status: "paused" });
  expect(types()).toEqual(["play_start", "seek"]); // not yet: might be a song change
  wait(PAUSE_SETTLE_MS);

  expect(types()).toEqual(["play_start", "seek", "pause"]);
  expect(logged[1]).toMatchObject({ position_ms: 61_000, payload: { from_ms: 3_000 } });
  expect(logged[2]).toMatchObject({ position_ms: 61_000 });
});

test("nothing is logged while paused, and play_start waits for playback", () => {
  const { player, tracker, radio, songs, play, startSong, types } = setup();
  tracker.begin(radio);
  tracker.loaded(songs);
  startSong(0); // loaded but not playing yet

  play(30_000);
  expect(types()).toEqual([]);

  player.emit({ type: "status", status: "playing" });
  expect(types()).toEqual(["play_start"]);
});

test("songs the player couldn't queue are logged as unavailable", () => {
  const { tracker, radio, songs, logged } = setup();

  tracker.begin(radio);
  tracker.loaded([songs[0], songs[2], songs[3]]);

  expect(logged).toEqual([
    expect.objectContaining({ type: "unavailable", song_id: songs[1].id, radio_position: 1 }),
    expect.objectContaining({ type: "unavailable", song_id: songs[4].id, radio_position: 4 }),
  ]);
});

test("a song that never started is neither skipped nor completed", () => {
  const { tracker, radio, songs, startSong, types } = setup();
  tracker.begin(radio);
  tracker.loaded(songs);
  startSong(0);
  tracker.markSkip();
  startSong(1);

  expect(types()).toEqual([]);
});

test("the brief pause while the player changes songs is not logged", () => {
  const { player, tracker, radio, songs, play, startSong, types } = setup();
  tracker.begin(radio);
  tracker.loaded(songs);
  player.emit({ type: "status", status: "playing" });
  startSong(0);
  play(5_000);

  tracker.markSkip();
  player.emit({ type: "status", status: "paused" });
  startSong(1);
  player.emit({ type: "status", status: "playing" });
  play(3_000);

  expect(types()).toEqual(["play_start", "skip", "play_start"]);
});

test("a new queue loaded while music is already playing is tracked from its first song", () => {
  const { player, tracker, radio, songs, logged, play, startSong, types } = setup();
  tracker.begin(radio);
  tracker.loaded(songs);
  player.emit({ type: "status", status: "playing" });
  startSong(0);
  play(4_000);

  // Tap track 3: the player keeps "playing", so it never reports the status again.
  tracker.markSkip();
  tracker.begin(radio);
  startSong(3);
  tracker.loaded(songs);
  play(11_000);

  expect(types()).toEqual(["play_start", "skip", "play_start", "progress"]);
  expect(logged[1]).toMatchObject({ song_id: songs[0].id, payload: { source: "app" } });
  expect(logged[2]).toMatchObject({ song_id: songs[3].id, radio_position: 3 });
});

test("the player is listened to once, however many queues are loaded", () => {
  const { player, tracker, radio } = setup();
  const subscribe = jest.spyOn(player, "subscribe");

  tracker.begin(radio);
  tracker.begin(radio);
  tracker.begin(radio);

  expect(subscribe).toHaveBeenCalledTimes(1);
});
