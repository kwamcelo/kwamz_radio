import Ionicons from "@expo/vector-icons/Ionicons";
import type { ComponentProps } from "react";
import { Pressable, StyleSheet, View } from "react-native";

type IconName = ComponentProps<typeof Ionicons>["name"];

type Props = {
  title: string;
  liked: boolean;
  banned: boolean;
  /** null: this provider has no library to add to. */
  added: boolean | null;
  onLike: () => void;
  onUnlike: () => void;
  onBan: () => void;
  onUnban: () => void;
  onAdd: () => void;
  testID: string;
};

/**
 * Two buttons per track.
 * Plus: like → (liked) add to Apple Music → (added) a check.
 * Minus: removes a like first; otherwise bans, and unbans when already banned.
 */
export function TrackActions(props: Props) {
  const { title, liked, banned, added, testID } = props;

  let plus: { icon: IconName; label: string; onPress?: () => void; on: boolean };
  if (added) plus = { icon: "checkmark-circle", label: `${title} is in your Apple Music library`, on: true };
  else if (liked && added === false)
    plus = { icon: "arrow-down-circle-outline", label: `Add ${title} to Apple Music`, onPress: props.onAdd, on: true };
  else if (liked) plus = { icon: "add-circle", label: `Liked ${title}`, on: true };
  else plus = { icon: "add-circle-outline", label: `Like ${title}`, onPress: props.onLike, on: false };

  let minus: { icon: IconName; label: string; onPress: () => void; on: boolean };
  if (liked) minus = { icon: "remove-circle-outline", label: `Remove like from ${title}`, onPress: props.onUnlike, on: false };
  else if (banned) minus = { icon: "remove-circle", label: `Unban ${title}`, onPress: props.onUnban, on: true };
  else minus = { icon: "remove-circle-outline", label: `Ban ${title}`, onPress: props.onBan, on: false };

  return (
    <View style={styles.actions}>
      <IconButton testID={`${testID}-minus`} {...minus} />
      <IconButton testID={`${testID}-plus`} {...plus} />
    </View>
  );
}

type IconProps = {
  testID: string;
  label: string;
  icon: IconName;
  on: boolean;
  onPress?: () => void;
};

function IconButton({ testID, label, icon, on, onPress }: IconProps) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: on, disabled: !onPress }}
      disabled={!onPress}
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      <Ionicons name={icon} size={26} color={on ? "#5b2bd6" : "#9a9aa2"} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: "row", alignItems: "center" },
  button: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  pressed: { opacity: 0.5 },
});
