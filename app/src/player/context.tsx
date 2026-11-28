import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import type { Player, PlayerStatus } from "./types";

const PlayerContext = createContext<Player | null>(null);

export function PlayerProvider({ player, children }: { player: Player; children: ReactNode }) {
  return <PlayerContext.Provider value={player}>{children}</PlayerContext.Provider>;
}

export function usePlayer(): Player {
  const player = useContext(PlayerContext);
  if (!player) throw new Error("usePlayer needs a <PlayerProvider>");
  return player;
}

/** The player's status and current song, kept up to date from its events. */
export function usePlayerState(player: Player): { status: PlayerStatus; songId: string | null } {
  const [status, setStatus] = useState<PlayerStatus>("idle");
  const [songId, setSongId] = useState<string | null>(null);
  useEffect(
    () =>
      player.subscribe((event) => {
        if (event.type === "status") setStatus(event.status);
        else setSongId(event.songId);
      }),
    [player],
  );
  return { status, songId };
}
