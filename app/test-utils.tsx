// Test doubles: a fake API server behind the real typed client, and a fake Player.
import { render } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { createApiClient, type Radio, type Song } from "./src/api/client";
import { ApiProvider } from "./src/api/context";
import { EventsProvider } from "./src/events/context";
import type { KeyValueStore, LoggedEvent } from "./src/events/logger";
import { PlaybackTracker } from "./src/events/playback";
import { PlayerProvider } from "./src/player/context";
import type { Player, PlayerEvent } from "./src/player/types";
import { PrefsContext, UserPrefs } from "./src/prefs";

export class MemoryStore implements KeyValueStore {
  readonly items = new Map<string, string>();
  async getItem(key: string) {
    return this.items.get(key) ?? null;
  }
  async setItem(key: string, value: string) {
    this.items.set(key, value);
  }
}

type Handler = (request: Request) => Response | Promise<Response>;

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Routes are "METHOD /path" ("/likes/*" matches any last segment); unmatched requests
 * get a 404. Every request is recorded. */
export function fakeApi(routes: Record<string, Handler>) {
  const requests: Request[] = [];
  const client = createApiClient(
    "http://api.test",
    async () => "test-token",
    async (request) => {
      requests.push(request.clone());
      const { pathname } = new URL(request.url);
      const wildcard = pathname.replace(/\/[^/]+$/, "/*");
      const handler =
        routes[`${request.method} ${pathname}`] ?? routes[`${request.method} ${wildcard}`];
      return handler ? handler(request) : json({ detail: "Not Found" }, 404);
    },
  );
  return { client, requests };
}

export class FakePlayer implements Player {
  readonly provider = "apple" as const;
  private listeners = new Set<(event: PlayerEvent) => void>();
  /** Songs load() reports as unplayable. */
  unplayable = new Set<string>();
  load = jest.fn(async (songs: Song[], _startIndex: number) =>
    songs.filter((s) => !this.unplayable.has(s.id)),
  );
  play = jest.fn(async () => this.emit({ type: "status", status: "playing" }));
  pause = jest.fn(async () => this.emit({ type: "status", status: "paused" }));
  seek = jest.fn(async (_positionMs: number) => {});
  next = jest.fn(async () => {});
  addToLibrary? = jest.fn(async (_song: Song) => {});
  /** What positionMs() reports. */
  position = 0;
  positionMs = () => this.position;

  subscribe(listener: (event: PlayerEvent) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(event: PlayerEvent) {
    this.listeners.forEach((l) => l(event));
  }
}

/** An iPhone with a Dynamic Island. */
const SAFE_AREA = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
};

/** Trackers started by screen tests; stopped after each test so no interval leaks. */
const trackers: PlaybackTracker[] = [];
afterEach(() => trackers.splice(0).forEach((t) => t.stop()));

export async function renderScreen(
  ui: ReactElement,
  {
    api,
    player = new FakePlayer(),
    storage = new MemoryStore(),
  }: { api: ReturnType<typeof fakeApi>; player?: Player; storage?: MemoryStore },
) {
  const logged: LoggedEvent[] = [];
  const log = (event: LoggedEvent) => logged.push(event);
  const tracker = new PlaybackTracker(player, log);
  trackers.push(tracker);
  const prefs = new UserPrefs(storage, "test-user");
  const result = await render(
    <SafeAreaProvider initialMetrics={SAFE_AREA}>
      <ApiProvider client={api.client}>
        <PlayerProvider player={player}>
          <PrefsContext.Provider value={prefs}>
            <EventsProvider events={{ log, tracker }}>{ui}</EventsProvider>
          </PrefsContext.Provider>
        </PlayerProvider>
      </ApiProvider>
    </SafeAreaProvider>,
  );
  return { result, logged, tracker, prefs, storage };
}

let counter = 0;

export function song(title: string, overrides: Partial<Song> = {}): Song {
  counter += 1;
  return {
    id: `00000000-0000-4000-8000-${String(counter).padStart(12, "0")}`,
    title,
    artist: "Test Artist",
    apple_id: `${1000 + counter}`,
    genres: [],
    ...overrides,
  };
}

export function radio(trackCount = 20): Radio {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    seed_song: song("Seed"),
    parent_radio_id: null,
    model_version: "dummy-v1",
    seed_strategy: "direct",
    created_at: "2026-11-26T00:00:00Z",
    tracks: Array.from({ length: trackCount }, (_, i) => ({
      position: i,
      song: song(`Track ${i}`),
      liked: false,
      banned: false,
    })),
  };
}
