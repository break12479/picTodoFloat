import { create } from "zustand";

import { invoke } from "../lib/tauri";
import { useTaskStore } from "./taskStore";
import type { Settings } from "../types";

/** 可更新的设置项（字段名与 Settings 一致）。 */
export type SettingsPatch = Partial<Omit<Settings, "hotkey_error">>;

// snake_case → 后端 SettingsPatch 的 camelCase
const toWire = (p: SettingsPatch) =>
  Object.fromEntries(
    Object.entries(p).map(([k, v]) => [k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()), v])
  );

// 不透明度滑块停手多久后再写库（拖动过程中每一帧都写一次没有必要）
const OPACITY_SAVE_MS = 300;
let opacityTimer: number | undefined;

interface SettingsState {
  settings: Settings | null;
  dataDir: string | null;
  load: () => Promise<void>;
  /**
   * 局部更新：先在界面上生效，后端失败（如快捷键被占用、开机自启设置失败）则回滚这些项并提示。
   * 返回是否成功。
   */
  update: (patch: SettingsPatch) => Promise<boolean>;
  /** 不透明度：界面立即生效，停手后再写库。 */
  setOpacity: (opacity: number) => void;
  setDataDir: (dir: string | null) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
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

  update: async (patch) => {
    const before = get().settings;
    if (before) set({ settings: { ...before, ...patch } });
    try {
      const settings = await invoke<Settings>("update_settings", { patch: toWire(patch) });
      set({ settings });
      // 改了「默认折叠已完成」：各组单独点过的设定作废，全部按新默认
      if (patch.hide_completed !== undefined) useTaskStore.getState().resetDoneToggles();
      return true;
    } catch (e) {
      // 只回滚这次改的项，别覆盖期间其它已成功的修改
      const cur = get().settings;
      if (cur && before) {
        const revert = Object.fromEntries(
          Object.keys(patch).map((k) => [k, before[k as keyof Settings]])
        );
        set({ settings: { ...cur, ...revert } });
      }
      useTaskStore.getState().setError(String(e));
      return false;
    }
  },

  setOpacity: (opacity) => {
    set((s) => ({ settings: s.settings ? { ...s.settings, opacity } : s.settings }));
    window.clearTimeout(opacityTimer);
    opacityTimer = window.setTimeout(() => get().update({ opacity }), OPACITY_SAVE_MS);
  },

  setDataDir: async (dir) => {
    try {
      const dataDir = await invoke<string>("set_data_dir", { dir });
      set({ dataDir });
      // 图片绝对路径随数据位置变化，重新拉取任务
      await useTaskStore.getState().load();
    } catch (e) {
      useTaskStore.getState().setError(`切换存储位置失败：${e}`);
    }
  },
}));
