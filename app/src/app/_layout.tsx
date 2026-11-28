import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { createApiClient } from "../api/client";
import { ApiProvider } from "../api/context";
import { AuthProvider } from "../auth/context";
import { getAccessToken, useSupabaseAuth } from "../auth/supabase";
import { config } from "../config";
import { PlayerProvider } from "../player/context";
import { MusicKitPlayer } from "../player/musickit";
import { SessionProvider } from "../session";

const api = createApiClient(config.apiUrl, getAccessToken);
const player = new MusicKitPlayer();

export default function RootLayout() {
  const auth = useSupabaseAuth();

  if (auth.status === "loading") {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  const signedIn = auth.status === "signedIn";
  const stack = (
    // Screens draw their own top bar inside the safe area (components/Screen).
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="index" />
        <Stack.Screen name="radio/[id]" />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
    </Stack>
  );
  return (
    <SafeAreaProvider>
      <AuthProvider auth={auth}>
        <ApiProvider client={api}>
          <PlayerProvider player={player}>
            {auth.userId ? (
              <SessionProvider userId={auth.userId} api={api} player={player}>
                {stack}
              </SessionProvider>
            ) : (
              stack
            )}
            <StatusBar style="auto" />
          </PlayerProvider>
        </ApiProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
