import { useEffect } from "react";

import { clipboardImage, droppedImages, pastedName, stageDraftImages } from "../lib/images";
import { useTaskStore } from "../stores/taskStore";

/**
 * 全局粘贴 / 拖放图片（PixPin 式 Ctrl+V）。
 * - 输入框正在写新任务时，由 TaskInput 自己接住（图片随新任务保存），不会走到这里；
 * - 有选中的任务 → 贴到该任务（任务行会滚到可见处并闪一下）；
 * - 没有选中任务 → 暂存到输入框，写点文字回车即成为新任务。
 * 拖放：没有落在任务行 / 输入框上的图片同样暂存到输入框。WebView 对没人处理的文件拖放
 * 默认会直接打开那个文件，整个应用界面会被替换掉，所以这里一律接住。
 */
export function usePasteImage() {
  const addImage = useTaskStore((s) => s.addImage);

  useEffect(() => {
    const onPaste = async (e: ClipboardEvent) => {
      const file = clipboardImage(e.clipboardData);
      if (!file) return; // 无图片 → 交给默认行为（如粘贴文本）
      e.preventDefault();

      const selectedId = useTaskStore.getState().selectedId;
      if (selectedId == null) {
        await stageDraftImages([file], [pastedName(file)]);
        return;
      }
      const buf = new Uint8Array(await file.arrayBuffer());
      await addImage(selectedId, buf, pastedName(file));
    };

    const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes("Files") ?? false;
    const onDragOver = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e) || e.defaultPrevented) return; // 任务行 / 输入框已经处理过
      e.preventDefault();
      stageDraftImages(droppedImages(e.dataTransfer));
    };

    document.addEventListener("paste", onPaste);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);
    return () => {
      document.removeEventListener("paste", onPaste);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("drop", onDrop);
    };
  }, [addImage]);
}
