import { Pressable, StyleSheet, Text, View } from "react-native";

import type { Song } from "../api/client";

type Props = {
  song: Song;
  onPress?: () => void;
  active?: boolean;
  disabled?: boolean;
  testID?: string;
};

export function SongRow({ song, onPress, active, disabled, testID }: Props) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled || !onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active, disabled }}
      accessibilityLabel={`${song.title} by ${song.artist}`}
      style={({ pressed }) => [styles.row, pressed && styles.pressed, active && styles.active]}
    >
      <View style={styles.text}>
        <Text style={[styles.title, active && styles.activeText]} numberOfLines={1}>
          {song.title}
        </Text>
        <Text style={styles.artist} numberOfLines={1}>
          {song.artist}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: 12, paddingHorizontal: 16 },
  pressed: { opacity: 0.6 },
  active: { backgroundColor: "#f2ecff" },
  text: { gap: 2 },
  title: { fontSize: 16, fontWeight: "500" },
  activeText: { color: "#5b2bd6" },
  artist: { fontSize: 14, color: "#666" },
});
