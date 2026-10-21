import type { Group, Task } from "../types";

export const byOrder = (a: Task, b: Task) =>
  a.sort_order - b.sort_order || a.id - b.id;

/** 容器键：置顶 / 默认组 / 用户分组。 */
export const containerKeyOf = (t: Task): string =>
  t.pinned ? "pinned" : t.group_id == null ? "default" : `g${t.group_id}`;

/** 分区视图：置顶、各用户分组、默认组，组内按手动顺序。 */
export function buildView(tasks: Task[], groups: Group[]) {
  const pinned = tasks.filter((t) => t.pinned).sort(byOrder);
  const nonPinned = tasks.filter((t) => !t.pinned);
  const userGroups = [...groups]
    .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)
    .map((g) => ({
      group: g,
      items: nonPinned.filter((t) => t.group_id === g.id).sort(byOrder),
    }));
  const def = nonPinned.filter((t) => t.group_id == null).sort(byOrder);
  return { pinned, userGroups, def };
}

/** 搜索过滤：不区分大小写的子串匹配，可限定容器；没有查询词返回 undefined（不过滤）。 */
export function searchMatcher(
  query: string,
  scope: string | null
): ((t: Task) => boolean) | undefined {
  const q = query.trim().toLowerCase();
  if (!q) return undefined;
  return (t) =>
    t.content.toLowerCase().includes(q) && (!scope || containerKeyOf(t) === scope);
}

export interface Visibility {
  /** 折叠起来的容器键 */
  collapsed: readonly string[];
  /** 「已完成」默认是否折叠（设置项；置顶分区不受影响） */
  hideCompleted: boolean;
  /** 单独点过「已完成 N」、与默认相反的分组 */
  doneToggled: readonly string[];
  /** 搜索过滤 */
  match?: (t: Task) => boolean;
}

/** 某个分组此刻是否展开「已完成」：默认跟设置走，单独点过的组反过来。 */
export const showCompleted = (key: string, vis: Pick<Visibility, "hideCompleted" | "doneToggled">) =>
  vis.hideCompleted === vis.doneToggled.includes(key);

/**
 * 屏幕上实际显示的任务，按展示顺序：与 GroupSection 的渲染一致——组内未完成在前、
 * 已完成在后；折叠的组、被折叠的已完成项、搜索不匹配的都不算。
 * Shift 范围选择、批量操作、多选拖拽都只针对这些，不会动到看不见的任务。
 */
export function visibleTaskIds(tasks: Task[], groups: Group[], vis: Visibility): number[] {
  const v = buildView(vis.match ? tasks.filter(vis.match) : tasks, groups);
  const section = (key: string, items: Task[]) => {
    if (vis.collapsed.includes(key)) return [];
    if (key === "pinned") return items;
    const active = items.filter((t) => !t.completed);
    return showCompleted(key, vis) ? [...active, ...items.filter((t) => t.completed)] : active;
  };
  return [
    ...section("pinned", v.pinned),
    ...v.userGroups.flatMap((g) => section(`g${g.group.id}`, g.items)),
    ...section("default", v.def),
  ].map((t) => t.id);
}
