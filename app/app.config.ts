// Static settings live in app.json; this adds the plugins that need .env values.
import type { ConfigContext, ExpoConfig } from "expo/config";

/** "123-abc.apps.googleusercontent.com" -> "com.googleusercontent.apps.123-abc" */
function reversedClientId(clientId: string): string {
  return clientId.split(".").reverse().join(".");
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const googleIosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  const base = config as ExpoConfig;
  // Development against a plain-http server on the Mac (e.g. its Tailscale 100.x address,
  // which iOS doesn't count as local) needs iOS to allow http. Builds pointed at an https
  // API never get this.
  const insecureDev = (process.env.EXPO_PUBLIC_API_URL ?? "").startsWith("http://");
  return {
    ...base,
    ios: {
      ...base.ios,
      // Signing team for local builds; from app/.env.local so it stays out of the repo.
      appleTeamId: process.env.APPLE_TEAM_ID || base.ios?.appleTeamId,
      ...(insecureDev && {
        infoPlist: {
          ...base.ios?.infoPlist,
          // Only this key: iOS ignores NSAllowsArbitraryLoads when NSAllowsLocalNetworking
          // is also set.
          NSAppTransportSecurity: { NSAllowsArbitraryLoads: true },
        },
      }),
    },
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
