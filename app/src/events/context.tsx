import { createContext, useContext, type ReactNode } from "react";

import type { LoggedEvent } from "./logger";
import type { PlaybackTracker } from "./playback";

export type Events = {
  log: (event: LoggedEvent) => void;
  tracker: PlaybackTracker;
};

const EventsContext = createContext<Events | null>(null);

export function EventsProvider({ events, children }: { events: Events; children: ReactNode }) {
  return <EventsContext.Provider value={events}>{children}</EventsContext.Provider>;
}

export function useEvents(): Events {
  const events = useContext(EventsContext);
  if (!events) throw new Error("useEvents needs an <EventsProvider>");
  return events;
}
