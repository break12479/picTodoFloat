/** 贴边隐藏的几何计算（全部用物理像素），与窗口 API 无关，便于单独验证。 */

export type Edge = "top" | "left" | "right";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 窗口离屏幕（工作区）边缘多近算「贴边」。 */
export function dockedEdge(win: Rect, area: Rect, snap: number): Edge | null {
  if (win.y - area.y <= snap) return "top";
  if (win.x - area.x <= snap) return "left";
  if (area.x + area.w - (win.x + win.w) <= snap) return "right";
  return null;
}

/**
 * 那条边外面还有屏幕区域时不能往外藏：多屏时会藏到相邻那块屏上（反而整个露出来），
 * 任务栏在那条边上时会盖住任务栏。monitors 用显示器的完整区域（含任务栏）。
 */
export function edgeBlocked(edge: Edge, win: Rect, area: Rect, monitors: Rect[]): boolean {
  const probe =
    edge === "top"
      ? { x: win.x + win.w / 2, y: area.y - 2 }
      : edge === "left"
      ? { x: area.x - 2, y: win.y + win.h / 2 }
      : { x: area.x + area.w + 2, y: win.y + win.h / 2 };
  return monitors.some(
    (m) => probe.x >= m.x && probe.x < m.x + m.w && probe.y >= m.y && probe.y < m.y + m.h
  );
}

/** 收起：窗口推到屏幕外，只露出 peek 像素的一条边。 */
export function hiddenPosition(win: Rect, area: Rect, edge: Edge, peek: number) {
  switch (edge) {
    case "top":
      return { x: win.x, y: area.y - win.h + peek };
    case "left":
      return { x: area.x - win.w + peek, y: win.y };
    case "right":
      return { x: area.x + area.w - peek, y: win.y };
  }
}

/** 展开：贴着那条边完整露出来。 */
export function shownPosition(win: Rect, area: Rect, edge: Edge) {
  switch (edge) {
    case "top":
      return { x: win.x, y: area.y };
    case "left":
      return { x: area.x, y: win.y };
    case "right":
      return { x: area.x + area.w - win.w, y: win.y };
  }
}
