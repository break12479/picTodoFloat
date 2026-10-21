import { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LogicalSize } from "@tauri-apps/api/dpi";

import { convertFileSrc, invoke } from "../lib/tauri";
import Icon from "./Icon";

/**
 * PixPin 式悬浮图片窗：独立透明置顶小窗，只显示图片。
 * 拖动图片 = 拖动窗口（系统级，跟手、可跨屏）；滚轮缩放（改窗口大小）；
 * Ctrl+C 复制；Esc/双击关闭。悬停时右上角浮出工具条（缩放比例 / 复制 / 关闭），
 * 滚轮缩放时短暂显示当前比例。图外区域不存在 → 不遮挡背后应用。
 */
export default function PinView() {
  const params = new URLSearchParams(window.location.search);
  const path = decodeURIComponent(params.get("src") ?? "");

  const natural = useRef({ w: 0, h: 0 }); // 已按屏幕封顶的基准尺寸
  const scale = useRef(1);
  const [zoom, setZoom] = useState(100);
  const [zooming, setZooming] = useState(false);
  const zoomTimer = useRef<number | undefined>(undefined);
  const [copied, setCopied] = useState(false);

  const applySize = () => {
    const { w, h } = natural.current;
    if (!w || !h) return;
    setZoom(Math.round(scale.current * 100));
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

  const copy = () => {
    invoke<boolean>("copy_image_to_clipboard", { path })
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1000);
      })
      .catch(() => {});
  };

  useEffect(() => {
    const w = getCurrentWindow();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        w.close();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") {
        e.preventDefault();
        copy();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [path]);

  const onWheel = (e: React.WheelEvent) => {
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    scale.current = Math.max(0.2, Math.min(5, scale.current * factor));
    applySize();
    // 缩放过程中在中间显示比例，停手后淡出
    setZooming(true);
    window.clearTimeout(zoomTimer.current);
    zoomTimer.current = window.setTimeout(() => setZooming(false), 800);
  };

  // 工具条上的点击 / 双击不能冒泡到根节点（双击根节点 = 关闭窗口）
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

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
      <div className="pin-toolbar" onDoubleClick={stop} onMouseDown={stop}>
        <button
          className="pin-tool pin-zoom-btn"
          title="恢复 100%（滚轮缩放）"
          aria-label={`当前缩放 ${zoom}%，点击恢复 100%`}
          onClick={() => {
            scale.current = 1;
            applySize();
          }}
        >
          {zoom}%
        </button>
        <button className="pin-tool" title="复制图片（Ctrl+C）" aria-label="复制图片" onClick={copy}>
          <Icon name="copy" size={13} />
        </button>
        <button
          className="pin-tool"
          title="关闭（Esc / 双击图片）"
          aria-label="关闭"
          onClick={() => getCurrentWindow().close()}
        >
          <Icon name="x" size={13} />
        </button>
      </div>
      {zooming && <div className="pin-zoom-badge">{zoom}%</div>}
      {copied && <div className="pin-copied">已复制</div>}
    </div>
  );
}
