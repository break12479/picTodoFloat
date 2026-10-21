import { useState } from "react";

import { openPinWindow } from "../lib/pin";
import { convertFileSrc } from "../lib/tauri";
import type { TaskImage } from "../types";
import Icon from "./Icon";

interface Props {
  images: TaskImage[];
  onDelete: (imageId: number) => void;
}

const MAX = 3;

/**
 * 缩略图行：默认前 3 张 40×40，超过 3 张时第 3 格显示「+N」，点它展开全部（展开后可逐张查看 / 删除）。
 * 点缩略图 = 悬浮预览；悬停 × = 删除。
 */
export default function ImageThumbnailRow({ images, onDelete }: Props) {
  const [expanded, setExpanded] = useState(false);
  if (images.length === 0) return null;

  const overflow = images.length > MAX && !expanded;
  // 收起时第 3 格是「+N」入口，只露出前两张图
  const shown = overflow ? images.slice(0, MAX - 1) : images;

  return (
    <div className={`thumb-row ${expanded ? "expanded" : ""}`}>
      {shown.map((img) => (
        <div key={img.id} className="thumb-cell">
          <img
            src={convertFileSrc(img.thumb_path)}
            alt={img.original_name ?? "图片"}
            role="button"
            tabIndex={0}
            draggable={false}
            onClick={(e) => {
              e.stopPropagation();
              openPinWindow(img);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                openPinWindow(img);
              }
            }}
            title={img.original_name ?? "点击悬浮查看"}
          />
          <button
            className="thumb-del"
            title="删除这张图片"
            aria-label="删除这张图片"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(img.id);
            }}
          >
            <Icon name="x" size={10} />
          </button>
        </div>
      ))}
      {overflow && (
        <button
          className="thumb-cell thumb-more"
          title={`展开全部 ${images.length} 张图片`}
          aria-label={`展开全部 ${images.length} 张图片`}
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(true);
          }}
        >
          <img src={convertFileSrc(images[MAX - 1].thumb_path)} alt="" draggable={false} />
          <span className="thumb-overflow">+{images.length - (MAX - 1)}</span>
        </button>
      )}
      {expanded && images.length > MAX && (
        <button
          className="thumb-collapse"
          title="收起图片"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(false);
          }}
        >
          收起
        </button>
      )}
    </div>
  );
}
