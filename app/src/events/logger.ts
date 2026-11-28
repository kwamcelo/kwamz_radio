// Raw listening events, queued on the device and sent to POST /events in batches.
// The queue is saved after every change, so it survives being offline and the app
// being killed; every event has a client-made id, so resending a batch is harmless.
import type { EventIn } from "../api/client";

export type LoggedEvent = Omit<EventIn, "id" | "client_ts" | "payload"> & {
  payload?: Record<string, unknown>;
};
type QueuedEvent = EventIn & { id: string; client_ts: string };

/** "sent": stored (or already stored). "rejected": the server will never take this batch.
 * "failed": try again later (offline, server error, expired session). */
export type SendResult = "sent" | "rejected" | "failed";

/** How a POST /events response status maps onto the retry rules. */
export function sendResult(status: number): SendResult {
  if (status >= 200 && status < 300) return "sent";
  // Expired session, rate limit, timeout or server trouble: worth retrying.
  if (status === 401 || status === 408 || status === 429 || status >= 500) return "failed";
  return "rejected";
}

export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export type LoggerOptions = {
  send: (batch: QueuedEvent[]) => Promise<SendResult>;
  storage: KeyValueStore;
  /** Events of different users never share a queue. */
  userId: string;
  newId: () => string;
  now?: () => Date;
  /** Wait this long after an event before sending, to batch them. */
  flushDelayMs?: number;
  /** Send at once when this many are waiting. */
  flushAt?: number;
};

export const MAX_BATCH = 500; // the API's limit
const MAX_QUEUE = 5000; // oldest are dropped past this (weeks offline)
const RETRY_BASE_MS = 2_000;
const RETRY_MAX_MS = 5 * 60_000;

export class EventLogger {
  private queue: QueuedEvent[] = [];
  private readonly ready: Promise<void>;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private sending: Promise<void> | null = null;
  private failures = 0;
  private stopped = false;
  private readonly key: string;
  private readonly now: () => Date;
  private readonly flushDelayMs: number;
  private readonly flushAt: number;

  constructor(private readonly options: LoggerOptions) {
    this.key = `events.queue.v1.${options.userId}`;
    this.now = options.now ?? (() => new Date());
    this.flushDelayMs = options.flushDelayMs ?? 15_000;
    this.flushAt = options.flushAt ?? 100;
    this.ready = this.restore();
  }

  /** Queue an event. Never throws: logging must not break playback. */
  log(event: LoggedEvent): void {
    if (this.stopped) return;
    const queued: QueuedEvent = {
      ...event,
      payload: event.payload ?? {},
      id: this.options.newId(),
      client_ts: this.now().toISOString(),
    };
    void this.ready.then(async () => {
      this.queue.push(queued);
      if (this.queue.length > MAX_QUEUE) this.queue.splice(0, this.queue.length - MAX_QUEUE);
      await this.save();
      if (this.queue.length >= this.flushAt) void this.flush();
      else this.schedule(this.flushDelayMs);
    });
  }

  /** Send everything waiting now (e.g. when the app goes to the background). */
  async flush(): Promise<void> {
    await this.ready;
    if (this.sending) return this.sending;
    this.clearTimer();
    this.sending = this.sendAll().finally(() => {
      this.sending = null;
    });
    return this.sending;
  }

  /** Events not yet accepted by the server. */
  async pending(): Promise<readonly QueuedEvent[]> {
    await this.ready;
    return this.queue;
  }

  /** Stop timers (sign-out). Whatever is queued stays saved for this user. */
  stop(): void {
    this.stopped = true;
    this.clearTimer();
  }

  private async sendAll(): Promise<void> {
    while (this.queue.length > 0 && !this.stopped) {
      const batch = this.queue.slice(0, MAX_BATCH);
      let result: SendResult;
      try {
        result = await this.options.send(batch);
      } catch {
        result = "failed";
      }
      if (result === "failed") {
        this.failures += 1;
        const delay = Math.min(RETRY_BASE_MS * 2 ** (this.failures - 1), RETRY_MAX_MS);
        this.schedule(delay);
        return;
      }
      // "rejected" is dropped too: retrying a batch the server refuses would block the
      // queue forever.
      this.failures = 0;
      const done = new Set(batch.map((e) => e.id));
      this.queue = this.queue.filter((e) => !done.has(e.id));
      await this.save();
    }
  }

  private schedule(delayMs: number): void {
    if (this.stopped || this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, delayMs);
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private async restore(): Promise<void> {
    try {
      const saved = await this.options.storage.getItem(this.key);
      if (saved) this.queue = JSON.parse(saved) as QueuedEvent[];
    } catch {
      this.queue = [];
    }
    if (this.queue.length > 0) this.schedule(0);
  }

  private async save(): Promise<void> {
    try {
      await this.options.storage.setItem(this.key, JSON.stringify(this.queue));
    } catch {
      // Storage full or unavailable: the events stay in memory until sent.
    }
  }
}
