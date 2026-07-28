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

/** 全部任务的展示顺序（扁平），用于 Shift 范围选择。 */
export function flatVisibleIds(tasks: Task[], groups: Group[]): number[] {
  const v = buildView(tasks, groups);
  return [
    ...v.pinned,
    ...v.userGroups.flatMap((g) => g.items),
    ...v.def,
  ].map((t) => t.id);
}
