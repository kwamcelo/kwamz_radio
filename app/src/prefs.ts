// Small per-user settings kept on the device.
import { createContext, useContext } from "react";

import type { KeyValueStore } from "./events/logger";

export class UserPrefs {
  constructor(
    private readonly storage: KeyValueStore,
    private readonly userId: string,
  ) {}

  private key(name: string): string {
    return `prefs.v1.${this.userId}.${name}`;
  }

  /** The user ticked "Don't show again" on the Add to Apple Music warning. */
  async libraryWarningDismissed(): Promise<boolean> {
    return (await this.storage.getItem(this.key("libraryWarningDismissed"))) === "1";
  }

  async dismissLibraryWarning(): Promise<void> {
    await this.storage.setItem(this.key("libraryWarningDismissed"), "1");
  }

  /** Songs this user added to their Apple Music library from the app. */
  async addedToLibrary(): Promise<Set<string>> {
    const saved = await this.storage.getItem(this.key("addedToLibrary"));
    return new Set(saved ? (JSON.parse(saved) as string[]) : []);
  }

  async markAddedToLibrary(songId: string): Promise<void> {
    const added = await this.addedToLibrary();
    added.add(songId);
    await this.storage.setItem(this.key("addedToLibrary"), JSON.stringify([...added]));
  }
}

export const PrefsContext = createContext<UserPrefs | null>(null);

export function usePrefs(): UserPrefs {
  const prefs = useContext(PrefsContext);
  if (!prefs) throw new Error("usePrefs needs a <PrefsContext.Provider>");
  return prefs;
}
