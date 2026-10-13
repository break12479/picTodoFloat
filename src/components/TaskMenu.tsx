import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useTaskStore } from "../stores/taskStore";
import type { Task } from "../types";
import Icon from "./Icon";

interface Props {
  task: Task;
  /**
   * 弹出位置（视口坐标）。align = "end"：从 ⋯ 按钮右下角向左展开；
   * "start"：右键点击处向右展开。
   */
  at: { x: number; y: number; align: "start" | "end" };
  onClose: () => void;
  onRequestDelete: (task: Task) => void;
}

/**
 * 任务操作菜单：置顶 / 归档 / 移动到分组 / 删除。
 * 用 portal + fixed 定位 + 打开后按实际尺寸夹回视口内（靠近底部时向上翻），
 * 不受列表滚动容器裁切，也不受拖拽时祖先 transform 影响。
 */
export default function TaskMenu({ task, at, onClose, onRequestDelete }: Props) {
  const pin = useTaskStore((s) => s.pin);
  const archiveOne = useTaskStore((s) => s.archiveOne);
  const moveToGroup = useTaskStore((s) => s.moveToGroup);
  const groups = useTaskStore((s) => s.groups);

  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: at.x, top: at.y });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const margin = 6;
    let left = at.align === "end" ? at.x - width : at.x;
    left = Math.max(margin, Math.min(left, window.innerWidth - width - margin));
    let top = at.y + 4;
    if (top + height > window.innerHeight - margin) {
      top = Math.max(margin, at.y - height - 4);
    }
    setPos({ left, top });
  }, [at.x, at.y, at.align]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const run = (fn: () => void) => () => {
    onClose();
    fn();
  };

  const currentGroup = task.group_id ?? null;

  // portal 后 React 合成事件仍会沿组件树冒泡到任务行（触发选中 / 拖动），这里统一截住
  return createPortal(
    <div
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div
        className="popover-backdrop"
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />
      <div
        ref={ref}
        className="popover"
        style={{ left: pos.left, top: pos.top }}
      >
        <button className="popover-item" onClick={run(() => pin(task.id, !task.pinned))}>
          <Icon name="pin" size={14} />
          {task.pinned ? "取消置顶" : "置顶"}
        </button>
        <button className="popover-item" onClick={run(() => archiveOne(task.id))}>
          <Icon name="archive" size={14} />
          归档
        </button>

        <div className="popover-sep" />
        <div className="popover-label">移动到</div>
        <div className="popover-scroll">
          {[{ id: null as number | null, name: "默认组" }, ...groups].map((g) => (
            <button
              key={g.id ?? "default"}
              className="popover-item"
              onClick={run(() => {
                if (g.id !== currentGroup) moveToGroup(task.id, g.id);
              })}
            >
              <span className="popover-check">
                {g.id === currentGroup && <Icon name="check" size={13} />}
              </span>
              <span className="popover-text">{g.name}</span>
            </button>
          ))}
        </div>

        <div className="popover-sep" />
        <button
          className="popover-item danger"
          onClick={run(() => onRequestDelete(task))}
        >
          <Icon name="trash" size={14} />
          删除
        </button>
      </div>
    </div>,
    document.body
  );
}
