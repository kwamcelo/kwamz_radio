import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";

import { PlayerUnavailable } from "../src/player/types";
import { RadioScreen } from "../src/screens/RadioScreen";
import { FakePlayer, fakeApi, json, radio, renderScreen } from "../test-utils";

async function setup(r = radio()) {
  const api = fakeApi({ [`GET /radios/${r.id}`]: () => json(r) });
  const player = new FakePlayer();
  await renderScreen(<RadioScreen radioId={r.id} />, { api, player });
  return { r, api, player };
}

test("shows all 20 tracks of the radio", async () => {
  const { r } = await setup();

  expect(await screen.findByText(`Radio from ${r.seed_song.title}`)).toBeTruthy();
  for (const track of r.tracks) expect(screen.getByTestId(`track-${track.position}`)).toBeTruthy();
  expect(screen.getByText(/20 songs/)).toBeTruthy();
});

test("play loads the whole radio from the top and plays it", async () => {
  const { r, player } = await setup();

  await fireEvent.press(await screen.findByTestId("play-pause"));

  await waitFor(() => expect(player.play).toHaveBeenCalled());
  expect(player.load).toHaveBeenCalledWith(
    r.tracks.map((t) => t.song),
    0,
  );
  expect(screen.getByLabelText("Pause")).toBeTruthy();
});

test("tapping a track plays from that track", async () => {
  const { player } = await setup();

  await fireEvent.press(await screen.findByTestId("track-7"));

  await waitFor(() => expect(player.play).toHaveBeenCalled());
  expect(player.load.mock.calls[0][1]).toBe(7);
});

test("pause, resume and next go to the player without reloading", async () => {
  const { player } = await setup();
  await fireEvent.press(await screen.findByTestId("play-pause"));
  await waitFor(() => expect(player.play).toHaveBeenCalledTimes(1));

  await fireEvent.press(screen.getByLabelText("Pause"));
  await waitFor(() => expect(player.pause).toHaveBeenCalled());
  await fireEvent.press(screen.getByLabelText("Play"));
  await waitFor(() => expect(player.play).toHaveBeenCalledTimes(2));
  await fireEvent.press(screen.getByTestId("next"));
  await waitFor(() => expect(player.next).toHaveBeenCalled());

  expect(player.load).toHaveBeenCalledTimes(1);
});

test("highlights the song the player reports as current", async () => {
  const { r, player } = await setup();
  await screen.findByTestId("track-3");

  await act(async () => player.emit({ type: "track", songId: r.tracks[3].song.id }));

  expect(screen.getByTestId("track-3")).toHaveProp("accessibilityState", {
    selected: true,
    disabled: false,
  });
  expect(screen.getByTestId("track-2")).toHaveProp("accessibilityState", {
    selected: false,
    disabled: false,
  });
});

test("songs the player can't play are shown disabled", async () => {
  const r = radio();
  const api = fakeApi({ [`GET /radios/${r.id}`]: () => json(r) });
  const player = new FakePlayer();
  player.unplayable.add(r.tracks[5].song.id);
  await renderScreen(<RadioScreen radioId={r.id} />, { api, player });

  await fireEvent.press(await screen.findByTestId("play-pause"));

  await waitFor(() => expect(screen.getByTestId("track-5")).toBeDisabled());
  expect(screen.getByTestId("track-4")).not.toBeDisabled();
});

test("explains why playback is unavailable", async () => {
  const { player } = await setup();
  player.load.mockRejectedValueOnce(new PlayerUnavailable("Playing needs an Apple Music subscription"));

  await fireEvent.press(await screen.findByTestId("play-pause"));

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Playing needs an Apple Music subscription",
  );
  expect(player.play).not.toHaveBeenCalled();
});

test("a missing radio shows an error", async () => {
  const api = fakeApi({});
  await renderScreen(<RadioScreen radioId="22222222-2222-4222-8222-222222222222" />, { api });

  expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load this radio.");
});

test("the back button goes back", async () => {
  const r = radio();
  const onBack = jest.fn();
  const api = fakeApi({ [`GET /radios/${r.id}`]: () => json(r) });
  await renderScreen(<RadioScreen radioId={r.id} onBack={onBack} />, { api });

  await screen.findByTestId("track-0");
  await fireEvent.press(screen.getByTestId("back"));

  expect(onBack).toHaveBeenCalledTimes(1);
});
