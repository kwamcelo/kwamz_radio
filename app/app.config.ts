// Static settings live in app.json; this adds the plugins that need .env values.
import type { ConfigContext, ExpoConfig } from "expo/config";

/** "123-abc.apps.googleusercontent.com" -> "com.googleusercontent.apps.123-abc" */
function reversedClientId(clientId: string): string {
  return clientId.split(".").reverse().join(".");
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const googleIosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  const base = config as ExpoConfig;
  return {
    ...base,
    // Signing team for local builds; from app/.env.local so it stays out of the repo.
    ios: { ...base.ios, appleTeamId: process.env.APPLE_TEAM_ID || base.ios?.appleTeamId },
    plugins: [
      "expo-router",
      "expo-apple-authentication",
      "./modules/kwamz-musickit/app.plugin.js",
      // Without an iOS client id the Google button is hidden, so the plugin is skipped.
      ...(googleIosClientId
        ? [
            [
              "@react-native-google-signin/google-signin",
              { iosUrlScheme: reversedClientId(googleIosClientId) },
            ] as [string, object],
          ]
        : []),
    ],
  };
};
