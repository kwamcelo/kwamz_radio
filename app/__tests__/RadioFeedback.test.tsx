import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";

import type { Radio } from "../src/api/client";
import { RadioScreen } from "../src/screens/RadioScreen";
import { FakePlayer, MemoryStore, fakeApi, json, radio as makeRadio, renderScreen } from "../test-utils";

const ok = () => new Response(null, { status: 204 });

function routes(r: Radio, overrides: Record<string, () => Response> = {}) {
  return fakeApi({
    [`GET /radios/${r.id}`]: () => json(r),
    "PUT /likes/*": ok,
    "DELETE /likes/*": ok,
    "PUT /bans/*": ok,
    "DELETE /bans/*": ok,
    ...overrides,
  });
}

async function open(
  r = makeRadio(),
  { player = new FakePlayer(), storage = new MemoryStore(), api = routes(r), onOpenRadio = jest.fn() } = {},
) {
  const rendered = await renderScreen(<RadioScreen radioId={r.id} onOpenRadio={onOpenRadio} />, {
    api,
    player,
    storage,
  });
  await screen.findByTestId("track-0");
  return { ...rendered, r, api, player, onOpenRadio };
}

const label = (testID: string) => screen.getByTestId(testID).props.accessibilityLabel as string;
const requests = (api: ReturnType<typeof fakeApi>) =>
  api.requests.map((q) => `${q.method} ${new URL(q.url).pathname}`);

test("plus likes, minus takes the like back; both saved and logged with the radio", async () => {
  const { r, api, logged } = await open();
  const song = r.tracks[4].song;

  await fireEvent.press(screen.getByTestId("track-4-plus"));
  await waitFor(() => expect(label("track-4-plus")).toBe(`Add ${song.title} to Apple Music`));
  expect(label("track-4-minus")).toBe(`Remove like from ${song.title}`);
  await fireEvent.press(screen.getByTestId("track-4-minus"));
  await waitFor(() => expect(label("track-4-plus")).toBe(`Like ${song.title}`));

  expect(requests(api)).toContain(`PUT /likes/${song.id}`);
  expect(requests(api)).toContain(`DELETE /likes/${song.id}`);
  expect(requests(api).filter((q) => q.includes("/bans/"))).toEqual([]); // minus didn't ban
  expect(logged).toEqual([
    expect.objectContaining({ type: "like", song_id: song.id, radio_id: r.id, radio_position: 4 }),
    expect.objectContaining({ type: "unlike", song_id: song.id, position_ms: null }),
  ]);
});

test("buttons start from the user's saved likes and bans", async () => {
  const r = makeRadio();
  r.tracks[1].liked = true;
  r.tracks[2].banned = true;
  await open(r);

  expect(label("track-1-plus")).toMatch(/^Add .* to Apple Music$/);
  expect(label("track-2-minus")).toMatch(/^Unban/);
  expect(label("track-3-plus")).toMatch(/^Like/);
  expect(label("track-3-minus")).toMatch(/^Ban/);
});

test("minus bans, and again unbans; only the ban is logged", async () => {
  const { r, api, logged } = await open();

  await fireEvent.press(screen.getByTestId("track-0-minus"));
  await waitFor(() => expect(label("track-0-minus")).toMatch(/^Unban/));
  await fireEvent.press(screen.getByTestId("track-0-minus"));
  await waitFor(() => expect(label("track-0-minus")).toMatch(/^Ban/));

  expect(requests(api)).toEqual(
    expect.arrayContaining([`PUT /bans/${r.tracks[0].song.id}`, `DELETE /bans/${r.tracks[0].song.id}`]),
  );
  expect(logged.map((e) => e.type)).toEqual(["ban"]);
});

test("liking a banned song clears the ban", async () => {
  const r = makeRadio();
  r.tracks[0].banned = true;
  await open(r);

  await fireEvent.press(screen.getByTestId("track-0-plus"));

  await waitFor(() => expect(label("track-0-minus")).toMatch(/^Remove like/));
});

test("banning the song that's playing skips it", async () => {
  const { r, player, logged } = await open();
  await fireEvent.press(screen.getByTestId("play-pause"));
  await waitFor(() => expect(player.play).toHaveBeenCalled());
  player.position = 12_000;
  await act(async () => player.emit({ type: "track", songId: r.tracks[0].song.id }));

  await fireEvent.press(screen.getByTestId("track-0-minus"));

  await waitFor(() => expect(player.next).toHaveBeenCalled());
  expect(logged).toContainEqual(
    expect.objectContaining({ type: "ban", song_id: r.tracks[0].song.id, position_ms: 12_000 }),
  );
});

test("a failed save puts the button back and says so", async () => {
  const r = makeRadio();
  const { logged } = await open(r, { api: routes(r, { "PUT /likes/*": () => json({}, 500) }) });

  await fireEvent.press(screen.getByTestId("track-0-plus"));

  expect(await screen.findByRole("alert")).toHaveTextContent(/Couldn't save that/);
  expect(label("track-0-plus")).toMatch(/^Like/);
  expect(logged).toEqual([]);
});

/** Like a track, then press its download button. */
async function likeThenDownload(position: number) {
  await fireEvent.press(screen.getByTestId(`track-${position}-plus`));
  await waitFor(() => expect(label(`track-${position}-plus`)).toMatch(/to Apple Music$/));
  await fireEvent.press(screen.getByTestId(`track-${position}-plus`));
}

test("after a like, plus downloads: warning, then added to the library and a check", async () => {
  const { r, player, logged } = await open();
  const song = r.tracks[2].song;

  await likeThenDownload(2);
  expect(screen.getByTestId("library-warning")).toBeTruthy();
  expect(player.addToLibrary).not.toHaveBeenCalled();

  await fireEvent.press(screen.getByTestId("library-warning-add"));

  await waitFor(() => expect(player.addToLibrary).toHaveBeenCalledWith(song));
  await waitFor(() => expect(screen.getByTestId("track-2-plus")).toBeDisabled());
  expect(label("track-2-plus")).toBe(`${song.title} is in your Apple Music library`);
  expect(screen.queryByTestId("library-warning")).toBeNull();
  expect(logged.map((e) => e.type)).toEqual(["like", "add_to_library"]);
  expect(logged[1]).toMatchObject({ song_id: song.id, radio_position: 2 });
});

test("the warning keeps showing until 'Don't show again' is ticked", async () => {
  const { player } = await open(makeRadio());

  await likeThenDownload(0);
  await fireEvent.press(screen.getByTestId("library-warning-add"));
  await waitFor(() => expect(player.addToLibrary).toHaveBeenCalledTimes(1));

  await likeThenDownload(1);
  expect(screen.getByTestId("library-warning")).toBeTruthy(); // shown again
  await fireEvent.press(screen.getByTestId("dont-show-again"));
  await fireEvent.press(screen.getByTestId("library-warning-add"));
  await waitFor(() => expect(player.addToLibrary).toHaveBeenCalledTimes(2));

  await likeThenDownload(3);
  await waitFor(() => expect(player.addToLibrary).toHaveBeenCalledTimes(3));
  expect(screen.queryByTestId("library-warning")).toBeNull();
});

test("'Don't show again' and added songs are remembered for the user", async () => {
  const storage = new MemoryStore();
  const r = makeRadio();
  r.tracks[1].liked = true;
  const first = await open(r, { storage });
  await likeThenDownload(0);
  await fireEvent.press(screen.getByTestId("dont-show-again"));
  await fireEvent.press(screen.getByTestId("library-warning-add"));
  await waitFor(() => expect(first.player.addToLibrary).toHaveBeenCalled());
  await first.result.unmount();

  const player = new FakePlayer();
  await open(r, { storage, player });
  await waitFor(() => expect(screen.getByTestId("track-0-plus")).toBeDisabled());
  await fireEvent.press(screen.getByTestId("track-1-plus")); // already liked: downloads

  await waitFor(() => expect(player.addToLibrary).toHaveBeenCalled());
  expect(screen.queryByTestId("library-warning")).toBeNull();
});

test("cancelling the warning adds nothing and keeps the download button", async () => {
  const { player, logged } = await open();

  await likeThenDownload(0);
  await fireEvent.press(screen.getByTestId("library-warning-cancel"));

  expect(screen.queryByTestId("library-warning")).toBeNull();
  expect(player.addToLibrary).not.toHaveBeenCalled();
  expect(label("track-0-plus")).toMatch(/to Apple Music$/);
  expect(logged.map((e) => e.type)).toEqual(["like"]);
});

test("without a library, a liked song's plus just shows it's liked", async () => {
  const player = new FakePlayer();
  player.addToLibrary = undefined;
  const { r } = await open(makeRadio(), { player });

  await fireEvent.press(screen.getByTestId("track-0-plus"));

  await waitFor(() => expect(label("track-0-plus")).toBe(`Liked ${r.tracks[0].song.title}`));
  expect(screen.getByTestId("track-0-plus")).toBeDisabled();
});
test("long-press → Start radio from this makes a radio from that song and opens it", async () => {
  const r = makeRadio();
  const made = makeRadio();
  made.id = "33333333-3333-4333-8333-333333333333";
  const api = routes(r, { "POST /radios": () => json(made, 201) });
  jest.spyOn(Alert, "alert").mockImplementation((_title, _message, buttons) => {
    buttons?.find((b) => b.text === "Start radio from this")?.onPress?.();
  });
  const { onOpenRadio, logged } = await open(r, { api });

  await fireEvent(screen.getByTestId("track-6"), "longPress");

  await waitFor(() => expect(onOpenRadio).toHaveBeenCalledWith(made.id));
  const post = api.requests.find((q) => q.method === "POST");
  expect(await post?.json()).toEqual({ seed_song_id: r.tracks[6].song.id });
  expect(logged).toContainEqual(
    expect.objectContaining({
      type: "start_radio_from",
      song_id: r.tracks[6].song.id,
      radio_id: r.id,
      radio_position: 6,
    }),
  );
});
