import { EventLogger, MAX_BATCH, sendResult, type LoggerOptions } from "../src/events/logger";
import { MemoryStore } from "../test-utils";

const SONG = "00000000-0000-4000-8000-000000000001";

let nextId = 0;
function make(overrides: Partial<LoggerOptions> = {}) {
  const sent: { id: string; type: string }[][] = [];
  const send = jest.fn(async (batch: { id: string; type: string }[]) => {
    sent.push(batch);
    return "sent" as const;
  });
  const options: LoggerOptions = {
    userId: "user-a",
    storage: new MemoryStore(),
    newId: () => `id-${++nextId}`,
    send,
    flushDelayMs: 1_000,
    flushAt: 10,
    ...overrides,
  };
  return { logger: new EventLogger(options), send: options.send as jest.Mock, sent, options };
}

/** Let queued promise callbacks run (storage reads/writes are async). */
async function settle() {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test("events are sent together in one batch after a short wait", async () => {
  const { logger, send, sent } = make();

  logger.log({ type: "play_start", song_id: SONG });
  logger.log({ type: "progress", song_id: SONG, position_ms: 10_000 });
  await settle();
  expect(send).not.toHaveBeenCalled();

  await jest.advanceTimersByTimeAsync(1_000);

  expect(send).toHaveBeenCalledTimes(1);
  expect(sent[0].map((e) => e.type)).toEqual(["play_start", "progress"]);
  expect(await logger.pending()).toHaveLength(0);
});

test("events get an id, a timestamp and an empty payload", async () => {
  const now = new Date("2026-11-28T10:00:00Z");
  const { logger } = make({ now: () => now });

  logger.log({ type: "like", song_id: SONG });
  const [event] = await logger.pending();

  expect(event).toMatchObject({
    type: "like",
    song_id: SONG,
    client_ts: "2026-11-28T10:00:00.000Z",
    payload: {},
  });
  expect(event.id).toMatch(/^id-/);
});

test("a full queue is sent at once, split into API-sized batches", async () => {
  const { logger, sent } = make({ flushAt: MAX_BATCH + 100 });

  for (let i = 0; i < MAX_BATCH + 100; i++) logger.log({ type: "progress", song_id: SONG });
  await jest.advanceTimersByTimeAsync(0);

  expect(sent.map((b) => b.length)).toEqual([MAX_BATCH, 100]);
});

test("failed sends are retried with backoff, keeping the same ids", async () => {
  const attempts: string[][] = [];
  const results = ["failed", "failed", "sent"] as const;
  const { logger, send } = make({
    send: jest.fn(async (batch) => {
      attempts.push(batch.map((e) => e.id));
      return results[attempts.length - 1];
    }),
  });

  logger.log({ type: "skip", song_id: SONG });
  await jest.advanceTimersByTimeAsync(1_000); // first try fails
  await jest.advanceTimersByTimeAsync(1_999);
  expect(send).toHaveBeenCalledTimes(1); // backs off 2s
  await jest.advanceTimersByTimeAsync(1); // second try fails
  await jest.advanceTimersByTimeAsync(3_999);
  expect(send).toHaveBeenCalledTimes(2); // then 4s
  await jest.advanceTimersByTimeAsync(1); // third try succeeds

  expect(send).toHaveBeenCalledTimes(3);
  expect(new Set(attempts.map((ids) => ids.join()))).toEqual(new Set([attempts[0].join()]));
  expect(await logger.pending()).toHaveLength(0);
});

test("a send that throws (offline) is retried", async () => {
  let online = false;
  const { logger, send } = make({
    send: jest.fn(async () => {
      if (!online) throw new TypeError("Network request failed");
      return "sent" as const;
    }),
  });

  logger.log({ type: "pause", song_id: SONG });
  await jest.advanceTimersByTimeAsync(1_000);
  expect(await logger.pending()).toHaveLength(1);

  online = true;
  await jest.advanceTimersByTimeAsync(2_000);

  expect(send).toHaveBeenCalledTimes(2);
  expect(await logger.pending()).toHaveLength(0);
});

test("queued events survive the app being killed and are sent on the next start", async () => {
  const storage = new MemoryStore();
  const offline = make({ storage, send: jest.fn(async () => "failed" as const) });
  offline.logger.log({ type: "play_start", song_id: SONG });
  offline.logger.log({ type: "complete", song_id: SONG });
  await jest.advanceTimersByTimeAsync(1_000);
  offline.logger.stop(); // app killed

  const restarted = make({ storage });
  await jest.advanceTimersByTimeAsync(0);

  expect(restarted.sent.flat().map((e) => e.type)).toEqual(["play_start", "complete"]);
  expect(await restarted.logger.pending()).toHaveLength(0);
});

test("each user has their own queue", async () => {
  const storage = new MemoryStore();
  const a = make({ storage, send: jest.fn(async () => "failed" as const) });
  a.logger.log({ type: "like", song_id: SONG });
  await settle();
  a.logger.stop();

  const b = make({ storage, userId: "user-b" });
  await jest.advanceTimersByTimeAsync(5_000);

  expect(b.send).not.toHaveBeenCalled();
});

test("a batch the server rejects is dropped instead of blocking the queue", async () => {
  const results = ["rejected", "sent"] as const;
  let call = 0;
  const { logger, send } = make({ send: jest.fn(async () => results[call++]) });

  logger.log({ type: "like", song_id: SONG });
  await jest.advanceTimersByTimeAsync(1_000);
  logger.log({ type: "ban", song_id: SONG });
  await jest.advanceTimersByTimeAsync(1_000);

  expect(send).toHaveBeenCalledTimes(2);
  expect(await logger.pending()).toHaveLength(0);
});

test("broken storage never breaks logging", async () => {
  const storage = {
    getItem: async () => {
      throw new Error("disk");
    },
    setItem: async () => {
      throw new Error("full");
    },
  };
  const { logger, sent } = make({ storage });

  expect(() => logger.log({ type: "play_start", song_id: SONG })).not.toThrow();
  await jest.advanceTimersByTimeAsync(1_000);

  expect(sent.flat().map((e) => e.type)).toEqual(["play_start"]);
});

test("response statuses map to send results", () => {
  expect([200, 201].map(sendResult)).toEqual(["sent", "sent"]);
  expect([401, 408, 429, 500, 503].map(sendResult)).toEqual(Array(5).fill("failed"));
  expect([400, 403, 422].map(sendResult)).toEqual(["rejected", "rejected", "rejected"]);
});
