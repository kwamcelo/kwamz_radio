// Everything that belongs to one signed-in user: their event queue, playback tracking
// and on-device preferences. Rebuilt when the user changes.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { randomUUID } from "expo-crypto";
import { useEffect, useMemo, type ReactNode } from "react";
import { AppState } from "react-native";

import type { ApiClient } from "./api/client";
import { EventsProvider } from "./events/context";
import { EventLogger, sendResult } from "./events/logger";
import { PlaybackTracker } from "./events/playback";
import type { Player } from "./player/types";
import { PrefsContext, UserPrefs } from "./prefs";

type Props = { userId: string; api: ApiClient; player: Player; children: ReactNode };

export function SessionProvider({ userId, api, player, children }: Props) {
  const session = useMemo(() => {
    const logger = new EventLogger({
      userId,
      storage: AsyncStorage,
      newId: randomUUID,
      send: async (batch) => {
        const { response } = await api.POST("/events", { body: batch });
        return sendResult(response.status);
      },
    });
    const tracker = new PlaybackTracker(player, (event) => logger.log(event));
    return {
      logger,
      events: { log: (event: Parameters<EventLogger["log"]>[0]) => logger.log(event), tracker },
      prefs: new UserPrefs(AsyncStorage, userId),
    };
  }, [userId, api, player]);

  useEffect(() => {
    // Send what's queued whenever the app leaves the foreground.
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") void session.logger.flush();
    });
    return () => {
      sub.remove();
      session.events.tracker.stop();
      void session.logger.flush().finally(() => session.logger.stop());
    };
  }, [session]);

  return (
    <PrefsContext.Provider value={session.prefs}>
      <EventsProvider events={session.events}>{children}</EventsProvider>
    </PrefsContext.Provider>
  );
}
