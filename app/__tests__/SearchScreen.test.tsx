import { fireEvent, screen, waitFor } from "@testing-library/react-native";

import { SearchScreen } from "../src/screens/SearchScreen";
import { fakeApi, json, radio, renderScreen, song } from "../test-utils";

const hit = song("Hit Song");
const other = song("Other Song");

async function searchFor(q: string) {
  await fireEvent.changeText(screen.getByTestId("search-input"), q);
  await fireEvent(screen.getByTestId("search-input"), "submitEditing");
}

test("search shows results, and tapping one starts a radio and opens it", async () => {
  const made = radio();
  const api = fakeApi({
    "GET /search": () => json({ songs: [hit, other] }),
    "POST /radios": () => json(made, 201),
  });
  const onOpenRadio = jest.fn();
  await renderScreen(<SearchScreen onOpenRadio={onOpenRadio} />, { api });

  await searchFor("  hit  ");
  await fireEvent.press(await screen.findByText("Hit Song"));

  await waitFor(() => expect(onOpenRadio).toHaveBeenCalledWith(made.id));
  const [searchReq, radioReq] = api.requests;
  expect(new URL(searchReq.url).searchParams.get("q")).toBe("hit");
  expect(searchReq.headers.get("Authorization")).toBe("Bearer test-token");
  expect(await radioReq.json()).toEqual({ seed_song_id: hit.id });
});

test("an empty search does nothing", async () => {
  const api = fakeApi({});
  await renderScreen(<SearchScreen onOpenRadio={jest.fn()} />, { api });

  await searchFor("   ");

  expect(api.requests).toHaveLength(0);
});

test("no results says so", async () => {
  const api = fakeApi({ "GET /search": () => json({ songs: [] }) });
  await renderScreen(<SearchScreen onOpenRadio={jest.fn()} />, { api });

  await searchFor("zzzz");

  expect(await screen.findByText("No songs found.")).toBeTruthy();
});

test("a radio the server can't fill shows an error and stays on search", async () => {
  const api = fakeApi({
    "GET /search": () => json({ songs: [hit] }),
    "POST /radios": () => json({ detail: "not enough songs" }, 503),
  });
  const onOpenRadio = jest.fn();
  await renderScreen(<SearchScreen onOpenRadio={onOpenRadio} />, { api });

  await searchFor("hit");
  await fireEvent.press(await screen.findByText("Hit Song"));

  expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't do that right now/);
  expect(onOpenRadio).not.toHaveBeenCalled();
});

test("a network failure is reported", async () => {
  const api = fakeApi({
    "GET /search": () => {
      throw new TypeError("Network request failed");
    },
  });
  await renderScreen(<SearchScreen onOpenRadio={jest.fn()} />, { api });

  await searchFor("hit");

  expect(await screen.findByRole("alert")).toHaveTextContent(/Can't reach the server/);
});

test("sign out is in the top bar when offered", async () => {
  const onSignOut = jest.fn();
  await renderScreen(<SearchScreen onOpenRadio={jest.fn()} onSignOut={onSignOut} />, {
    api: fakeApi({}),
  });

  await fireEvent.press(screen.getByTestId("sign-out"));

  expect(onSignOut).toHaveBeenCalled();
});
