// Typed client for the kwamz_radio API. Types come from `schema.d.ts`, which is
// generated from api/openapi.json by `make contracts`: never edit it by hand.
import createClient, { type Middleware } from "openapi-fetch";

import type { components, paths } from "./schema";

export type Song = components["schemas"]["Song"];
export type Radio = components["schemas"]["Radio"];
export type EventIn = components["schemas"]["EventIn"];
export type Me = components["schemas"]["Me"];

export function createApiClient(baseUrl: string, getAccessToken: () => Promise<string | null>) {
  const client = createClient<paths>({ baseUrl });
  const auth: Middleware = {
    async onRequest({ request }) {
      const token = await getAccessToken();
      if (token) request.headers.set("Authorization", `Bearer ${token}`);
      return request;
    },
  };
  client.use(auth);
  return client;
}

export type ApiClient = ReturnType<typeof createApiClient>;
