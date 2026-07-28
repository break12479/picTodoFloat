import { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LogicalSize } from "@tauri-apps/api/dpi";

import { convertFileSrc, invoke } from "../lib/tauri";

/**
 * PixPin 式悬浮图片窗：独立透明置顶小窗，只显示图片。
 * 拖动图片 = 拖动窗口（系统级，跟手、可跨屏）；滚轮缩放（改窗口大小）；
 * Ctrl+C 复制；Esc/双击关闭。图外区域不存在 → 不遮挡背后应用。
 */
export default function PinView() {
  const params = new URLSearchParams(window.location.search);
  const path = decodeURIComponent(params.get("src") ?? "");

  const natural = useRef({ w: 0, h: 0 }); // 已按屏幕封顶的基准尺寸
  const scale = useRef(1);
  const [copied, setCopied] = useState(false);

  const applySize = () => {
    const { w, h } = natural.current;
    if (!w || !h) return;
    getCurrentWindow()
      .setSize(
        new LogicalSize(
          Math.max(60, Math.round(w * scale.current)),
          Math.max(45, Math.round(h * scale.current))
        )
      )
      .catch(() => {});
  };

  const onLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    const maxW = window.screen.availWidth * 0.85;
    const maxH = window.screen.availHeight * 0.85;
    const r = Math.min(1, maxW / img.naturalWidth, maxH / img.naturalHeight);
    natural.current = { w: img.naturalWidth * r, h: img.naturalHeight * r };
    scale.current = 1;
    applySize();
  };

  useEffect(() => {
    const w = getCurrentWindow();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        w.close();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") {
        e.preventDefault();
        invoke<boolean>("copy_image_to_clipboard", { path })
          .then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1000);
          })
          .catch(() => {});
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [path]);

  const onWheel = (e: React.WheelEvent) => {
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    scale.current = Math.max(0.2, Math.min(5, scale.current * factor));
    applySize();
  };

  return (
    <div
      className="pin-root"
      onWheel={onWheel}
      onDoubleClick={() => getCurrentWindow().close()}
    >
      <img
        src={convertFileSrc(path)}
        alt=""
        data-tauri-drag-region
        draggable={false}
        onLoad={onLoad}
      />
      {copied && <div className="pin-copied">已复制</div>}
    </div>
  );
}
