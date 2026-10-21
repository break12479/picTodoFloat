import { useEffect } from "react";
import {
  PhysicalPosition,
  availableMonitors,
  currentMonitor,
  getCurrentWindow,
} from "@tauri-apps/api/window";

import {
  dockedEdge,
  edgeBlocked,
  hiddenPosition,
  shownPosition,
  type Edge,
  type Rect,
} from "../lib/edgeDock";

// 离边缘多少逻辑像素以内算贴边；收起后露出多宽；鼠标离开多久后收起
const SNAP_PX = 12;
const PEEK_PX = 5;
const HIDE_DELAY_MS = 450;

interface Options {
  alwaysOnTop: boolean;
  /** 鼠标移开时面板变淡 */
  fadeWhenIdle: boolean;
  /** 贴边自动隐藏 */
  edgeHide: boolean;
}

/** 有弹窗 / 菜单 / 便签开着，或正在输入框里打字时，不收起窗口。 */
const busy = () =>
  !!document.querySelector(".dialog-overlay, .popover-backdrop, .note-overlay") ||
  (document.hasFocus() && !!document.activeElement?.matches("input, textarea, select"));

/** 主窗口的悬浮窗行为：置顶开关、鼠标移开变淡、贴边自动隐藏。 */
export function useWindowBehavior({ alwaysOnTop, fadeWhenIdle, edgeHide }: Options) {
  useEffect(() => {
    getCurrentWindow()
      .setAlwaysOnTop(alwaysOnTop)
      .catch(() => {});
  }, [alwaysOnTop]);

  useEffect(() => {
    if (!fadeWhenIdle && !edgeHide) return;
    const root = document.documentElement;
    const win = getCurrentWindow();
    let dock: { edge: Edge; area: Rect; scale: number } | null = null;
    let hidden = false;
    let selfMoving = false; // 自己调 setPosition 引起的 moved 事件不当成用户拖动
    let timer: number | undefined;
    let disposed = false;

    const winRect = async (): Promise<Rect> => {
      const [p, s] = await Promise.all([win.outerPosition(), win.outerSize()]);
      return { x: p.x, y: p.y, w: s.width, h: s.height };
    };

    // 拖动停下后判断是否贴边
    const detectDock = async () => {
      if (!edgeHide || hidden || selfMoving) return;
      const [mon, all] = await Promise.all([currentMonitor(), availableMonitors()]);
      if (!mon || disposed) return;
      const wa = mon.workArea;
      const area = { x: wa.position.x, y: wa.position.y, w: wa.size.width, h: wa.size.height };
      const rect = await winRect();
      const edge = dockedEdge(rect, area, SNAP_PX * mon.scaleFactor);
      const screens = all.map((m) => ({
        x: m.position.x,
        y: m.position.y,
        w: m.size.width,
        h: m.size.height,
      }));
      dock = edge && !edgeBlocked(edge, rect, area, screens) ? { edge, area, scale: mon.scaleFactor } : null;
    };

    const moveTo = async (p: { x: number; y: number }) => {
      selfMoving = true;
      try {
        await win.setPosition(new PhysicalPosition(Math.round(p.x), Math.round(p.y)));
      } finally {
        window.setTimeout(() => (selfMoving = false), 250);
      }
    };

    const collapse = async () => {
      if (!dock || hidden || busy()) return;
      hidden = true;
      root.classList.add("edge-hidden");
      await moveTo(hiddenPosition(await winRect(), dock.area, dock.edge, PEEK_PX * dock.scale));
    };

    const expand = async () => {
      if (!dock || !hidden) return;
      hidden = false;
      root.classList.remove("edge-hidden");
      await moveTo(shownPosition(await winRect(), dock.area, dock.edge));
    };

    const onLeave = () => {
      if (fadeWhenIdle) root.classList.add("idle");
      if (edgeHide && dock) {
        window.clearTimeout(timer);
        timer = window.setTimeout(collapse, HIDE_DELAY_MS);
      }
    };
    const onEnter = () => {
      root.classList.remove("idle");
      window.clearTimeout(timer);
      expand();
    };

    let moveDebounce: number | undefined;
    const unlisteners = [
      win.onMoved(() => {
        window.clearTimeout(moveDebounce);
        moveDebounce = window.setTimeout(detectDock, 200);
      }),
      // 通过快捷键 / 托盘叫出来时整个展开
      win.onFocusChanged(({ payload: focused }) => {
        if (focused) expand();
      }),
    ];
    detectDock();
    root.addEventListener("mouseleave", onLeave);
    root.addEventListener("mouseenter", onEnter);

    return () => {
      disposed = true;
      window.clearTimeout(timer);
      window.clearTimeout(moveDebounce);
      root.removeEventListener("mouseleave", onLeave);
      root.removeEventListener("mouseenter", onEnter);
      root.classList.remove("idle");
      unlisteners.forEach((u) => u.then((f) => f()).catch(() => {}));
      expand(); // 关掉功能时别把窗口留在屏幕外
    };
  }, [fadeWhenIdle, edgeHide]);
}
