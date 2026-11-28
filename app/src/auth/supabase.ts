// Supabase Auth with native sign-in sheets: the Apple / Google SDKs hand back an ID
// token, and Supabase exchanges it for a session (signInWithIdToken).
import "react-native-url-polyfill/auto";

import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  GoogleSignin,
  isCancelledResponse,
  isErrorWithCode,
  statusCodes,
} from "@react-native-google-signin/google-signin";
import { createClient, type Session } from "@supabase/supabase-js";
import * as AppleAuthentication from "expo-apple-authentication";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppState, Platform } from "react-native";

import { config } from "../config";
import { SignInCancelled, type Auth, type AuthMethod } from "./context";

export const supabase = createClient(config.supabaseUrl, config.supabaseKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Refresh tokens only while the app is in the foreground.
AppState.addEventListener("change", (state) => {
  if (state === "active") supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});

const googleConfigured = Boolean(config.googleWebClientId && config.googleIosClientId);
if (googleConfigured) {
  GoogleSignin.configure({
    webClientId: config.googleWebClientId,
    iosClientId: config.googleIosClientId,
  });
}

export async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

async function signInWithApple(): Promise<void> {
  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });
  } catch (e) {
    if ((e as { code?: string }).code === "ERR_REQUEST_CANCELED") throw new SignInCancelled();
    throw e;
  }
  if (!credential.identityToken) throw new Error("Apple did not return an identity token");
  const { error } = await supabase.auth.signInWithIdToken({
    provider: "apple",
    token: credential.identityToken,
  });
  if (error) throw error;
}

async function signInWithGoogle(): Promise<void> {
  let idToken: string | null;
  try {
    const response = await GoogleSignin.signIn();
    if (isCancelledResponse(response)) throw new SignInCancelled();
    idToken = response.data.idToken;
  } catch (e) {
    if (isErrorWithCode(e) && e.code === statusCodes.IN_PROGRESS) throw new SignInCancelled();
    throw e;
  }
  if (!idToken) throw new Error("Google did not return an ID token");
  const { error } = await supabase.auth.signInWithIdToken({ provider: "google", token: idToken });
  if (error) throw error;
}

/** The real Auth, backed by Supabase. */
export function useSupabaseAuth(): Auth {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [appleAvailable, setAppleAvailable] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    if (Platform.OS === "ios") AppleAuthentication.isAvailableAsync().then(setAppleAvailable);
    return () => data.subscription.unsubscribe();
  }, []);

  const signIn = useCallback(async (method: AuthMethod) => {
    await (method === "apple" ? signInWithApple() : signInWithGoogle());
  }, []);

  const signOut = useCallback(async () => {
    if (googleConfigured) await GoogleSignin.signOut().catch(() => null);
    await supabase.auth.signOut();
  }, []);

  return useMemo<Auth>(
    () => ({
      status: session === undefined ? "loading" : session ? "signedIn" : "signedOut",
      userId: session?.user.id ?? null,
      methods: [
        ...(appleAvailable ? (["apple"] as const) : []),
        ...(googleConfigured ? (["google"] as const) : []),
      ],
      signIn,
      signOut,
    }),
    [session, appleAvailable, signIn, signOut],
  );
}
