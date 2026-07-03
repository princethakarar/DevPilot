import { create } from "zustand";
import { getPlaygroundChangesList } from "../actions/commit";

export type ChangeStatus = "modified" | "added" | "deleted";
export interface ChangeEntry {
  path: string;
  status: ChangeStatus;
}

interface SourceControlState {
  changes: ChangeEntry[];
  isLoading: boolean;
  hasGithubRepo: boolean;
  setHasGithubRepo: (value: boolean) => void;
  refreshChanges: (playgroundId: string) => Promise<void>;
}

/**
 * Single source of truth for "what's changed" — both the Source Control panel's
 * file list and the rail icon's count badge read from this same store, so they
 * can never drift apart the way two independent fetches could.
 */
export const useSourceControl = create<SourceControlState>((set, get) => ({
  changes: [],
  isLoading: false,
  hasGithubRepo: false,

  setHasGithubRepo: (value) => set({ hasGithubRepo: value }),

  refreshChanges: async (playgroundId) => {
    if (!playgroundId || !get().hasGithubRepo) {
      set({ changes: [] });
      return;
    }
    set({ isLoading: true });
    const result = await getPlaygroundChangesList(playgroundId);
    set({ changes: result.changes || [], isLoading: false });
  },
}));
