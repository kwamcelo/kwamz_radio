import { useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, TextInput } from "react-native";

import type { Song } from "../api/client";
import { describeError, useApi } from "../api/context";
import { Screen } from "../components/Screen";
import { SongRow } from "../components/SongRow";

type Props = { onOpenRadio: (radioId: string) => void; onSignOut?: () => void };

export function SearchScreen({ onOpenRadio, onSignOut }: Props) {
  const api = useApi();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Song[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [startingFrom, setStartingFrom] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function search() {
    const q = query.trim();
    if (!q) return;
    setError(null);
    setSearching(true);
    try {
      const { data, response } = await api.GET("/search", { params: { query: { q } } });
      if (data) setResults(data.songs);
      else setError(describeError(response.status, "Search failed. Try again."));
    } catch {
      setError(describeError(undefined, ""));
    } finally {
      setSearching(false);
    }
  }

  async function startRadio(song: Song) {
    setError(null);
    setStartingFrom(song.id);
    try {
      const { data, response } = await api.POST("/radios", { body: { seed_song_id: song.id } });
      if (data) onOpenRadio(data.id);
      else setError(describeError(response.status, "Couldn't make a radio from that song."));
    } catch {
      setError(describeError(undefined, ""));
    } finally {
      setStartingFrom(null);
    }
  }

  return (
    <Screen
      title="Search"
      right={onSignOut && { label: "Sign out", onPress: onSignOut, testID: "sign-out" }}
    >
      <TextInput
        testID="search-input"
        style={styles.input}
        placeholder="Search for a song to start a radio"
        value={query}
        onChangeText={setQuery}
        onSubmitEditing={search}
        returnKeyType="search"
        autoCorrect={false}
        autoFocus
      />
      {(searching || startingFrom) && <ActivityIndicator testID="loading" style={styles.spinner} />}
      {error && (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      )}
      {results?.length === 0 && <Text style={styles.empty}>No songs found.</Text>}
      <FlatList
        data={results ?? []}
        keyExtractor={(s) => s.id}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <SongRow
            testID={`result-${item.id}`}
            song={item}
            disabled={startingFrom !== null}
            onPress={() => startRadio(item)}
          />
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: {
    marginHorizontal: 16,
    marginVertical: 8,
    padding: 12,
    fontSize: 16,
    borderRadius: 8,
    backgroundColor: "#f1f1f3",
  },
  spinner: { marginVertical: 8 },
  error: { color: "#c0392b", marginHorizontal: 16, marginBottom: 8 },
  empty: { color: "#666", marginHorizontal: 16 },
});
