import { create } from "zustand";

interface IdeLayoutState {
  detectedServerUrl: string | null;
  isPreviewVisible: boolean;
  activePane: "editor" | "terminal" | "preview" | null;
  setDetectedServerUrl: (url: string | null) => void;
  setPreviewVisible: (visible: boolean) => void;
  setActivePane: (pane: "editor" | "terminal" | "preview" | null) => void;
}

export const useIdeLayout = create<IdeLayoutState>((set) => ({
  detectedServerUrl: null,
  isPreviewVisible: true,
  activePane: null,
  setDetectedServerUrl: (url) => set({ detectedServerUrl: url }),
  setPreviewVisible: (visible) => set({ isPreviewVisible: visible }),
  setActivePane: (pane) => set({ activePane: pane }),
}));
