import { openPinWindow } from "../lib/pin";
import { convertFileSrc } from "../lib/tauri";
import type { TaskImage } from "../types";

interface Props {
  images: TaskImage[];
  onDelete: (imageId: number) => void;
}

/** 前 3 张 40×40 缩略图；超过 3 张时第 3 张显示「+N」。点击 = 悬浮预览；悬停 × = 删除。 */
export default function ImageThumbnailRow({ images, onDelete }: Props) {
  if (images.length === 0) return null;

  const MAX = 3;
  const overflow = images.length - MAX;

  return (
    <div className="thumb-row">
      {images.slice(0, MAX).map((img, i) => {
        const isLastVisible = i === MAX - 1 && overflow > 0;
        return (
          <div key={img.id} className="thumb-cell">
            <img
              src={convertFileSrc(img.thumb_path)}
              alt=""
              draggable={false}
              onClick={(e) => {
                e.stopPropagation();
                openPinWindow(img);
              }}
              title={img.original_name ?? "点击悬浮查看"}
            />
            {isLastVisible && (
              <span className="thumb-overflow">+{overflow + 1}</span>
            )}
            <span
              className="thumb-del"
              title="删除这张图片"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(img.id);
              }}
            >
              ×
            </span>
          </div>
        );
      })}
    </div>
  );
}
