import { create } from "zustand";

import { invoke } from "../lib/tauri";
import { useTaskStore } from "./taskStore";
import type { Settings } from "../types";

interface SettingsState {
  settings: Settings | null;
  dataDir: string | null;
  load: () => Promise<void>;
  setNotesFolder: (folder: string | null) => Promise<void>;
  setOpacity: (opacity: number) => Promise<void>;
  setAutoStart: (enabled: boolean) => Promise<void>;
  setTheme: (theme: "dark" | "light") => Promise<void>;
  setDataDir: (dir: string | null) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  settings: null,
  dataDir: null,

  load: async () => {
    try {
      const [settings, dataDir] = await Promise.all([
        invoke<Settings>("get_settings"),
        invoke<string>("get_data_dir"),
      ]);
      set({ settings, dataDir });
    } catch {
      // 设置读取失败不阻塞主流程
    }
  },

  setNotesFolder: async (folder) => {
    const settings = await invoke<Settings>("update_settings", {
      notesFolder: folder ?? "",
    });
    set({ settings });
  },

  setOpacity: async (opacity) => {
    // 先本地更新以获得即时反馈
    set((s) => ({
      settings: s.settings ? { ...s.settings, opacity } : s.settings,
    }));
    const settings = await invoke<Settings>("update_settings", { opacity });
    set({ settings });
  },

  setAutoStart: async (enabled) => {
    const settings = await invoke<Settings>("update_settings", {
      autoStart: enabled,
    });
    set({ settings });
  },

  setTheme: async (theme) => {
    // 先本地更新以获得即时反馈
    set((s) => ({ settings: s.settings ? { ...s.settings, theme } : s.settings }));
    const settings = await invoke<Settings>("update_settings", { theme });
    set({ settings });
  },

  setDataDir: async (dir) => {
    const dataDir = await invoke<string>("set_data_dir", { dir });
    set({ dataDir });
    // 图片绝对路径随数据位置变化，重新拉取任务
    await useTaskStore.getState().load();
  },
}));
