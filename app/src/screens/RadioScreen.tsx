import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import type { Radio, Song } from "../api/client";
import { describeError, useApi } from "../api/context";
import { LibraryWarning } from "../components/LibraryWarning";
import { Screen } from "../components/Screen";
import { SongRow } from "../components/SongRow";
import { TrackActions } from "../components/TrackActions";
import { useEvents } from "../events/context";
import { usePlayer, usePlayerState } from "../player/context";
import { PlayerUnavailable } from "../player/types";
import { useFeedback } from "./useFeedback";

type Props = {
  radioId: string;
  onBack?: () => void;
  /** Open another radio (after "Start radio from this"). */
  onOpenRadio?: (radioId: string) => void;
};

export function RadioScreen({ radioId, onBack, onOpenRadio }: Props) {
  const api = useApi();
  const player = usePlayer();
  const { tracker } = useEvents();
  const { status, songId } = usePlayerState(player);
  const [radio, setRadio] = useState<Radio | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [playError, setPlayError] = useState<string | null>(null);
  /** Songs the player accepted; null until the queue is loaded. */
  const [playable, setPlayable] = useState<Set<string> | null>(null);
  const feedback = useFeedback(radio);

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
      tracker.markSkip(); // whatever was playing is being replaced from the app
      tracker.begin(radio);
      const loaded = await player.load(songs, index);
      setPlayable(new Set(loaded.map((s) => s.id)));
      tracker.loaded(loaded);
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
      tracker.markSkip();
      await player.next();
    } catch {
      setPlayError("Couldn't skip. Try again.");
    }
  }

  function showOptions(song: Song) {
    Alert.alert(song.title, song.artist, [
      { text: "Start radio from this", onPress: () => startRadioFrom(song) },
      { text: "Cancel", style: "cancel" },
    ]);
  }

  async function startRadioFrom(song: Song) {
    setPlayError(null);
    try {
      const { data, response } = await api.POST("/radios", { body: { seed_song_id: song.id } });
      if (!data) {
        setPlayError(describeError(response.status, "Couldn't make a radio from that song."));
        return;
      }
      feedback.logAbout("start_radio_from", song);
      onOpenRadio?.(data.id);
    } catch {
      setPlayError(describeError(undefined, ""));
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
  const error = playError ?? feedback.error;
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
        {error && (
          <Text style={styles.error} accessibilityRole="alert">
            {error}
          </Text>
        )}
      </View>
      <FlatList
        data={radio.tracks}
        keyExtractor={(t) => String(t.position)}
        initialNumToRender={radio.tracks.length}
        renderItem={({ item, index }) => {
          const { liked, banned } = feedback.flags(item.song);
          return (
            <SongRow
              testID={`track-${item.position}`}
              song={item.song}
              active={item.song.id === songId}
              disabled={playable !== null && !playable.has(item.song.id)}
              muted={banned}
              onPress={() => playFrom(index)}
              onLongPress={() => showOptions(item.song)}
              accessory={
                <TrackActions
                  testID={`track-${item.position}`}
                  title={item.song.title}
                  liked={liked}
                  banned={banned}
                  added={feedback.added(item.song)}
                  onLike={() => feedback.toggleLike(item.song)}
                  onUnlike={() => feedback.toggleLike(item.song)}
                  onBan={() => feedback.toggleBan(item.song)}
                  onUnban={() => feedback.toggleBan(item.song)}
                  onAdd={() => feedback.requestAdd(item.song)}
                />
              }
            />
          );
        }}
      />
      <LibraryWarning
        visible={feedback.confirming !== null}
        onCancel={feedback.cancelAdd}
        onConfirm={feedback.confirmAdd}
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
