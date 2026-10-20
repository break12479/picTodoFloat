import { useEffect } from "react";

interface Props {
  message: string;
  confirmText?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/** 二次确认弹窗：Enter 确认，Esc 取消。 */
export default function ConfirmDialog({
  message,
  confirmText = "删除",
  onConfirm,
  onCancel,
}: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
      } else if (e.key === "Enter") {
        e.preventDefault();
        onConfirm();
      }
    };
    // capture：先于其他面板（如归档面板）的 Esc 处理，只关掉最上层这一个
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onConfirm, onCancel]);

  return (
    <div className="dialog-overlay" onClick={onCancel}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <p className="dialog-msg">{message}</p>
        <div className="dialog-actions">
          <button className="btn ghost" onClick={onCancel}>
            取消
          </button>
          <button className="btn danger" onClick={onConfirm}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
