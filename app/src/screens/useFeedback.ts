// ❤️ / 🚫 / ➕ state for one radio's tracks, kept in sync with the API and logged as events.
import { useEffect, useMemo, useState } from "react";

import type { Radio, Song } from "../api/client";
import { useApi } from "../api/context";
import { useEvents } from "../events/context";
import type { LoggedEvent } from "../events/logger";
import { usePlayer } from "../player/context";
import { usePrefs } from "../prefs";

type Flags = { liked: boolean; banned: boolean };

export function useFeedback(radio: Radio | null) {
  const api = useApi();
  const player = usePlayer();
  const prefs = usePrefs();
  const { log, tracker } = useEvents();
  /** Changes made on this screen, over the state the radio was loaded with. */
  const [changed, setChanged] = useState<Map<string, Flags>>(new Map());
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  /** The song waiting for the user to accept the library warning. */
  const [confirming, setConfirming] = useState<Song | null>(null);
  const saved = useMemo(
    () => new Map(radio?.tracks.map((t) => [t.song.id, { liked: t.liked, banned: t.banned }])),
    [radio],
  );
  const flagsOf = (song: Song): Flags =>
    changed.get(song.id) ?? saved.get(song.id) ?? { liked: false, banned: false };

  useEffect(() => {
    let cancelled = false;
    prefs.addedToLibrary().then((ids) => !cancelled && setAdded(ids));
    return () => {
      cancelled = true;
    };
  }, [prefs]);

  /** A feedback event about a song in this radio, with where playback was if it's playing. */
  function logAbout(type: LoggedEvent["type"], song: Song) {
    const now = tracker.playing();
    const track = radio?.tracks.find((t) => t.song.id === song.id);
    log({
      type,
      song_id: song.id,
      radio_id: radio?.id ?? null,
      radio_position: track?.position ?? null,
      provider: player.provider,
      position_ms: now?.songId === song.id ? Math.round(now.positionMs) : null,
    });
  }

  function set(song: Song, next: Flags) {
    setChanged((m) => new Map(m).set(song.id, next));
  }

  async function toggleLike(song: Song) {
    setError(null);
    const before = flagsOf(song);
    const liking = !before.liked;
    set(song, { liked: liking, banned: liking ? false : before.banned });
    const path = { params: { path: { song_id: song.id } } };
    try {
      const { response } = liking
        ? await api.PUT("/likes/{song_id}", path)
        : await api.DELETE("/likes/{song_id}", path);
      if (!response.ok) throw new Error(String(response.status));
      logAbout(liking ? "like" : "unlike", song);
    } catch {
      set(song, before);
      setError("Couldn't save that. Try again.");
    }
  }

  /** Banning the song that's playing also skips it. */
  async function toggleBan(song: Song) {
    setError(null);
    const before = flagsOf(song);
    const banning = !before.banned;
    set(song, { liked: banning ? false : before.liked, banned: banning });
    const path = { params: { path: { song_id: song.id } } };
    try {
      const { response } = banning
        ? await api.PUT("/bans/{song_id}", path)
        : await api.DELETE("/bans/{song_id}", path);
      if (!response.ok) throw new Error(String(response.status));
    } catch {
      set(song, before);
      setError("Couldn't save that. Try again.");
      return;
    }
    if (!banning) return; // there is no unban event
    logAbout("ban", song);
    if (tracker.playing()?.songId === song.id) {
      tracker.markSkip();
      await player.next().catch(() => null);
    }
  }

  async function requestAdd(song: Song) {
    setError(null);
    if (await prefs.libraryWarningDismissed()) await add(song);
    else setConfirming(song);
  }

  async function confirmAdd(dontShowAgain: boolean) {
    const song = confirming;
    setConfirming(null);
    if (!song) return;
    if (dontShowAgain) await prefs.dismissLibraryWarning();
    await add(song);
  }

  async function add(song: Song) {
    if (!player.addToLibrary) return;
    try {
      await player.addToLibrary(song);
    } catch {
      setError("Couldn't add that to Apple Music. Try again.");
      return;
    }
    setAdded((s) => new Set(s).add(song.id));
    await prefs.markAddedToLibrary(song.id);
    logAbout("add_to_library", song);
  }

  return {
    flags: flagsOf,
    /** null when the provider has no library (no ➕ button). */
    added: (song: Song): boolean | null => (player.addToLibrary ? added.has(song.id) : null),
    error,
    confirming,
    toggleLike,
    toggleBan,
    requestAdd,
    confirmAdd,
    cancelAdd: () => setConfirming(null),
    logAbout,
  };
}
