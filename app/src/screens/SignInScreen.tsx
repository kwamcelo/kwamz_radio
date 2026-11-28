import * as AppleAuthentication from "expo-apple-authentication";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { SignInCancelled, useAuth, type AuthMethod } from "../auth/context";

export function SignInScreen() {
  const auth = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function signIn(method: AuthMethod) {
    setError(null);
    setBusy(true);
    try {
      await auth.signIn(method);
    } catch (e) {
      if (!(e instanceof SignInCancelled)) setError("Sign-in failed. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen}>
      <Text style={styles.title}>kwamz radio</Text>
      <Text style={styles.subtitle}>Pick one song. Get a radio of 20.</Text>
      <View style={styles.buttons}>
        {auth.methods.includes("apple") && (
          <AppleAuthentication.AppleAuthenticationButton
            testID="sign-in-apple"
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
            cornerRadius={8}
            style={styles.appleButton}
            onPress={() => !busy && signIn("apple")}
          />
        )}
        {auth.methods.includes("google") && (
          <Pressable
            testID="sign-in-google"
            accessibilityRole="button"
            disabled={busy}
            onPress={() => signIn("google")}
            style={({ pressed }) => [styles.googleButton, pressed && styles.pressed]}
          >
            <Text style={styles.googleText}>Sign in with Google</Text>
          </Pressable>
        )}
        {auth.methods.length === 0 && (
          <Text style={styles.hint}>No sign-in method is configured on this device.</Text>
        )}
      </View>
      {error && (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: "center", padding: 24, gap: 8, backgroundColor: "#fff" },
  title: { fontSize: 32, fontWeight: "700" },
  subtitle: { fontSize: 16, color: "#666", marginBottom: 32 },
  buttons: { gap: 12 },
  appleButton: { height: 48, width: "100%" },
  googleButton: {
    height: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ccc",
    alignItems: "center",
    justifyContent: "center",
  },
  googleText: { fontSize: 17, fontWeight: "500" },
  pressed: { opacity: 0.6 },
  hint: { color: "#666" },
  error: { color: "#c0392b", marginTop: 16 },
});
