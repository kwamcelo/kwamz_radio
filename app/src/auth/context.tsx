import { createContext, useContext, type ReactNode } from "react";

export type AuthMethod = "apple" | "google";

export interface Auth {
  /** "loading" until the stored session has been read. */
  status: "loading" | "signedIn" | "signedOut";
  /** The Supabase user id while signed in. */
  userId: string | null;
  /** Which sign-in buttons this device can show. */
  methods: AuthMethod[];
  signIn(method: AuthMethod): Promise<void>;
  signOut(): Promise<void>;
}

const AuthContext = createContext<Auth | null>(null);

export function AuthProvider({ auth, children }: { auth: Auth; children: ReactNode }) {
  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}

export function useAuth(): Auth {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error("useAuth needs an <AuthProvider>");
  return auth;
}

/** Thrown when the user dismisses a sign-in sheet: not an error worth showing. */
export class SignInCancelled extends Error {
  constructor() {
    super("Sign-in cancelled");
  }
}
