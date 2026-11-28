import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";

import type { Radio, Song } from "../api/client";
import { describeError, useApi } from "../api/context";
import { Screen } from "../components/Screen";
import { SongRow } from "../components/SongRow";
import { usePlayer, usePlayerState } from "../player/context";
import { PlayerUnavailable } from "../player/types";

type Props = { radioId: string; onBack?: () => void };

export function RadioScreen({ radioId, onBack }: Props) {
  const api = useApi();
  const player = usePlayer();
  const { status, songId } = usePlayerState(player);
  const [radio, setRadio] = useState<Radio | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [playError, setPlayError] = useState<string | null>(null);
  /** Songs the player accepted; null until the queue is loaded. */
  const [playable, setPlayable] = useState<Set<string> | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .GET("/radios/{radio_id}", { params: { path: { radio_id: radioId } } })
      .then(({ data, response }) => {
        if (cancelled) return;
        if (data) setRadio(data);
        else setLoadError(describeError(response.status, "Couldn't load this radio."));
      })
      .catch(() => !cancelled && setLoadError(describeError(undefined, "")));
    return () => {
      cancelled = true;
    };
  }, [api, radioId]);

  const back = onBack && { label: "‹ Back", onPress: onBack, testID: "back" };

  async function playFrom(index: number) {
    if (!radio) return;
    setPlayError(null);
    try {
      const songs: Song[] = radio.tracks.map((t) => t.song);
      const loaded = await player.load(songs, index);
      setPlayable(new Set(loaded.map((s) => s.id)));
      if (loaded.length === 0) {
        setPlayError("None of these songs can play on Apple Music here.");
        return;
      }
      await player.play();
    } catch (e) {
      setPlayError(e instanceof PlayerUnavailable ? e.message : "Playback failed. Try again.");
    }
  }

  async function togglePlay() {
    setPlayError(null);
    try {
      if (status === "playing") await player.pause();
      else if (playable === null) await playFrom(0);
      else await player.play();
    } catch {
      setPlayError("Playback failed. Try again.");
    }
  }

  async function next() {
    try {
      await player.next();
    } catch {
      setPlayError("Couldn't skip. Try again.");
    }
  }

  if (loadError) {
    return (
      <Screen left={back}>
        <View style={styles.center}>
          <Text style={styles.error} accessibilityRole="alert">
            {loadError}
          </Text>
        </View>
      </Screen>
    );
  }
  if (!radio) {
    return (
      <Screen left={back}>
        <View style={styles.center}>
          <ActivityIndicator testID="loading" />
        </View>
      </Screen>
    );
  }

  const playing = status === "playing";
  return (
    <Screen left={back}>
      <View style={styles.header}>
        <Text style={styles.heading} numberOfLines={2}>
          Radio from {radio.seed_song.title}
        </Text>
        <Text style={styles.subheading}>
          {radio.seed_song.artist} · {radio.tracks.length} songs
        </Text>
        <View style={styles.controls}>
          <Pressable
            testID="play-pause"
            accessibilityRole="button"
            accessibilityLabel={playing ? "Pause" : "Play"}
            onPress={togglePlay}
            style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
          >
            <Text style={styles.primaryText}>{playing ? "Pause" : "Play"}</Text>
          </Pressable>
          <Pressable
            testID="next"
            accessibilityRole="button"
            accessibilityLabel="Next"
            disabled={playable === null}
            onPress={next}
            style={({ pressed }) => [
              styles.secondary,
              pressed && styles.pressed,
              playable === null && styles.disabled,
            ]}
          >
            <Text style={styles.secondaryText}>Next</Text>
          </Pressable>
        </View>
        {playError && (
          <Text style={styles.error} accessibilityRole="alert">
            {playError}
          </Text>
        )}
      </View>
      <FlatList
        data={radio.tracks}
        keyExtractor={(t) => String(t.position)}
        initialNumToRender={radio.tracks.length}
        renderItem={({ item, index }) => (
          <SongRow
            testID={`track-${item.position}`}
            song={item.song}
            active={item.song.id === songId}
            disabled={playable !== null && !playable.has(item.song.id)}
            onPress={() => playFrom(index)}
          />
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  header: { paddingHorizontal: 16, paddingBottom: 16, gap: 4 },
  heading: { fontSize: 22, fontWeight: "700" },
  subheading: { fontSize: 14, color: "#666" },
  controls: { flexDirection: "row", gap: 12, marginTop: 12 },
  primary: {
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 20,
    backgroundColor: "#5b2bd6",
  },
  primaryText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  secondary: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 20,
    backgroundColor: "#f1f1f3",
  },
  secondaryText: { fontSize: 16, fontWeight: "500" },
  pressed: { opacity: 0.6 },
  disabled: { opacity: 0.4 },
  error: { color: "#c0392b", marginTop: 8 },
});
