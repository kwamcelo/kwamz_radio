import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { Song } from "../api/client";

type Props = {
  song: Song;
  onPress?: () => void;
  onLongPress?: () => void;
  active?: boolean;
  disabled?: boolean;
  /** Shown faded, e.g. a banned song. */
  muted?: boolean;
  /** Buttons on the right of the row, outside the row's own press area. */
  accessory?: ReactNode;
  testID?: string;
};

export function SongRow({
  song,
  onPress,
  onLongPress,
  active,
  disabled,
  muted,
  accessory,
  testID,
}: Props) {
  return (
    <View style={[styles.row, active && styles.active]}>
      <Pressable
        testID={testID}
        onPress={onPress}
        onLongPress={onLongPress}
        disabled={disabled || (!onPress && !onLongPress)}
        accessibilityRole="button"
        accessibilityState={{ selected: active, disabled }}
        accessibilityLabel={`${song.title} by ${song.artist}`}
        accessibilityHint={onLongPress ? "Long press for more options" : undefined}
        style={({ pressed }) => [styles.main, pressed && styles.pressed, muted && styles.muted]}
      >
        <Text style={[styles.title, active && styles.activeText]} numberOfLines={1}>
          {song.title}
        </Text>
        <Text style={styles.artist} numberOfLines={1}>
          {song.artist}
        </Text>
      </Pressable>
      {accessory}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", paddingRight: 8 },
  main: { flex: 1, paddingVertical: 12, paddingHorizontal: 16, gap: 2 },
  pressed: { opacity: 0.6 },
  muted: { opacity: 0.4 },
  active: { backgroundColor: "#f2ecff" },
  title: { fontSize: 16, fontWeight: "500" },
  activeText: { color: "#5b2bd6" },
  artist: { fontSize: 14, color: "#666" },
});
