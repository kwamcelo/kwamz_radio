import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type Action = { label: string; onPress: () => void; testID?: string };

type Props = {
  title?: string;
  left?: Action;
  right?: Action;
  children: ReactNode;
};

/**
 * A full screen kept clear of the notch / Dynamic Island, the status bar and the home
 * indicator on every iPhone, with an optional top bar.
 */
export function Screen({ title, left, right, children }: Props) {
  const hasBar = Boolean(title || left || right);
  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom", "left", "right"]}>
      {hasBar && (
        <View style={styles.bar}>
          <View style={styles.side}>{left && <BarButton {...left} />}</View>
          <Text style={styles.title} numberOfLines={1} accessibilityRole="header">
            {title}
          </Text>
          <View style={[styles.side, styles.sideRight]}>{right && <BarButton {...right} />}</View>
        </View>
      )}
      {children}
    </SafeAreaView>
  );
}

function BarButton({ label, onPress, testID }: Action) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      onPress={onPress}
      hitSlop={12}
      style={({ pressed }) => pressed && styles.pressed}
    >
      <Text style={styles.action}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#fff" },
  bar: {
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
  },
  side: { flex: 1, alignItems: "flex-start" },
  sideRight: { alignItems: "flex-end" },
  title: { flex: 2, textAlign: "center", fontSize: 17, fontWeight: "600" },
  action: { color: "#5b2bd6", fontSize: 16 },
  pressed: { opacity: 0.5 },
});
