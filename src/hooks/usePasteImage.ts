import { useEffect } from "react";

import { useTaskStore } from "../stores/taskStore";

/**
 * 全局粘贴（PixPin 式 Ctrl+V）：把剪贴板里的图片贴入当前选中的任务。
 * 主路径——从 clipboardData.items 找 image/*，与 P0 验证一致。
 */
export function usePasteImage() {
  const addImage = useTaskStore((s) => s.addImage);
  const select = useTaskStore((s) => s.select);
  const setError = useTaskStore((s) => s.setError);

  useEffect(() => {
    const onPaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      const imgItem = Array.from(items).find((it) =>
        it.type.startsWith("image/")
      );
      if (!imgItem) return; // 无图片 → 交给默认行为（如粘贴文本）

      const selectedId = useTaskStore.getState().selectedId;
      if (selectedId == null) {
        setError("请先点选一个任务，再 Ctrl+V 粘贴图片");
        return;
      }

      const file = imgItem.getAsFile();
      if (!file) return;
      e.preventDefault();

      const ext = imgItem.type.split("/")[1] || "png";
      const buf = new Uint8Array(await file.arrayBuffer());
      await addImage(selectedId, buf, `paste-${Date.now()}.${ext}`);
    };

    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [addImage, select, setError]);
}
