import { useTaskStore } from "../stores/taskStore";

/** 剪贴板里的图片：只取第一张（部分程序会把同一张图以多种格式放进剪贴板）。 */
export function clipboardImage(dt: DataTransfer | null): File | null {
  const item = Array.from(dt?.items ?? []).find(
    (it) => it.kind === "file" && it.type.startsWith("image/")
  );
  return item?.getAsFile() ?? null;
}

/** 拖进来的图片文件（可多张）。 */
export const droppedImages = (dt: DataTransfer | null): File[] =>
  Array.from(dt?.files ?? []).filter((f) => f.type.startsWith("image/"));

/** 剪贴板图片没有文件名，按类型起一个。 */
export const pastedName = (f: File) =>
  `paste-${Date.now()}.${f.type.split("/")[1] || "png"}`;

/** 把图片暂存到输入框（随下一条新任务一起保存），并把焦点放回输入框。 */
export async function stageDraftImages(files: File[], names?: string[]) {
  if (files.length === 0) return;
  const read = await Promise.all(
    files.map(async (f, i) => ({
      bytes: new Uint8Array(await f.arrayBuffer()),
      name: names?.[i] ?? (f.name || pastedName(f)),
      url: URL.createObjectURL(f), // 预览用，移除 / 提交时释放
    }))
  );
  useTaskStore.getState().addDraftImages(read);
  document
    .querySelector<HTMLTextAreaElement>(".task-input textarea, .task-input .live-input")
    ?.focus();
}
