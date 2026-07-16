import { create } from "zustand";

const STORAGE_KEY = "devpilot:ai-inline-completion-enabled";

/**
 * Personal on/off preference for inline AI ghost-text suggestions —
 * localStorage is enough for this (matches how other purely-client display
 * preferences in this app are handled; there's no per-user DB settings table
 * to hook into). Defaults OFF: unlike existing read-only AI features (chat),
 * this one fires a network request on every pause in typing, so it should be
 * an opt-in the user consciously turns on, not a silent default cost.
 */
function readInitial(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(STORAGE_KEY) === "true";
}

interface AiCompletionSettingsState {
  isEnabled: boolean;
  setEnabled: (value: boolean) => void;
  toggle: () => void;
}

export const useAiCompletionSettings = create<AiCompletionSettingsState>((set, get) => ({
  isEnabled: readInitial(),
  setEnabled: (value) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, String(value));
    }
    set({ isEnabled: value });
  },
  toggle: () => get().setEnabled(!get().isEnabled),
}));
