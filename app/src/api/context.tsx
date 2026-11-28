import { createContext, useContext, type ReactNode } from "react";

import type { ApiClient } from "./client";

const ApiContext = createContext<ApiClient | null>(null);

export function ApiProvider({ client, children }: { client: ApiClient; children: ReactNode }) {
  return <ApiContext.Provider value={client}>{children}</ApiContext.Provider>;
}

export function useApi(): ApiClient {
  const client = useContext(ApiContext);
  if (!client) throw new Error("useApi needs an <ApiProvider>");
  return client;
}

/** A user-facing message for a failed API call. */
export function describeError(status: number | undefined, fallback: string): string {
  if (status === 401) return "Your session expired. Sign in again.";
  if (status === 503) return "The server couldn't do that right now. Try again in a moment.";
  if (status === undefined) return "Can't reach the server. Check your connection.";
  return fallback;
}
