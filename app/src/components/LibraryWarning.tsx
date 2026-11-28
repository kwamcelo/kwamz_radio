import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

type Props = {
  visible: boolean;
  onCancel: () => void;
  /** `dontShowAgain`: the user ticked the box. */
  onConfirm: (dontShowAgain: boolean) => void;
};

export const LIBRARY_WARNING =
  "Songs added to your Apple Music library can't be removed from this app — remove them in the Music app.";

/** Shown before ➕ until the user ticks "Don't show again". */
export function LibraryWarning({ visible, onCancel, onConfirm }: Props) {
  const [dontShowAgain, setDontShowAgain] = useState(false);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.card} testID="library-warning">
          <Text style={styles.title}>Add to Apple Music</Text>
          <Text style={styles.body}>{LIBRARY_WARNING}</Text>
          <Pressable
            testID="dont-show-again"
            accessibilityRole="checkbox"
            accessibilityState={{ checked: dontShowAgain }}
            onPress={() => setDontShowAgain((v) => !v)}
            style={styles.checkRow}
          >
            <Text style={styles.box}>{dontShowAgain ? "☑" : "☐"}</Text>
            <Text style={styles.body}>Don&apos;t show again</Text>
          </Pressable>
          <View style={styles.buttons}>
            <Pressable testID="library-warning-cancel" accessibilityRole="button" onPress={onCancel}>
              <Text style={styles.cancel}>Cancel</Text>
            </Pressable>
            <Pressable
              testID="library-warning-add"
              accessibilityRole="button"
              onPress={() => onConfirm(dontShowAgain)}
            >
              <Text style={styles.confirm}>Add</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  card: { backgroundColor: "#fff", borderRadius: 14, padding: 20, gap: 12, width: "100%" },
  title: { fontSize: 17, fontWeight: "600" },
  body: { fontSize: 15, color: "#333" },
  checkRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  box: { fontSize: 20 },
  buttons: { flexDirection: "row", justifyContent: "flex-end", gap: 24, marginTop: 4 },
  cancel: { fontSize: 16, color: "#666" },
  confirm: { fontSize: 16, fontWeight: "600", color: "#5b2bd6" },
});
