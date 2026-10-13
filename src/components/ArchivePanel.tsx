import { useEffect, useState } from "react";

import { useTaskStore } from "../stores/taskStore";
import type { Task } from "../types";
import ConfirmDialog from "./ConfirmDialog";
import Icon from "./Icon";

interface Props {
  onClose: () => void;
}

/** 归档任务面板：查看已归档任务，可取消归档（回到原分组）或彻底删除。 */
export default function ArchivePanel({ onClose }: Props) {
  const archivedTasks = useTaskStore((s) => s.archivedTasks);
  const loadArchived = useTaskStore((s) => s.loadArchived);
  const unarchiveOne = useTaskStore((s) => s.unarchiveOne);
  const remove = useTaskStore((s) => s.remove);

  const [pending, setPending] = useState<Task | null>(null);

  useEffect(() => {
    loadArchived();
  }, [loadArchived]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="archive-panel" onClick={(e) => e.stopPropagation()}>
        <header className="settings-head">
          <span>
            归档 <span className="head-count">{archivedTasks.length}</span>
          </span>
          <button className="icon-btn" onClick={onClose} title="关闭（Esc）">
            <Icon name="x" size={15} />
          </button>
        </header>

        <div className="archive-body">
          {archivedTasks.length === 0 && (
            <div className="empty-state">
              <div className="empty-hint">暂无归档任务</div>
            </div>
          )}
          {archivedTasks.map((t) => (
            <div key={t.id} className="archive-item">
              <div className="archive-item-main">
                <span className="archive-item-text" title={t.content}>
                  {t.content || "（空任务）"}
                </span>
                <span className="archive-item-date">
                  {t.archived_at?.slice(0, 10)}
                  {t.images.length > 0 && (
                    <>
                      {" · "}
                      <Icon name="image" size={11} /> {t.images.length}
                    </>
                  )}
                </span>
              </div>
              <div className="archive-item-actions">
                <button
                  className="icon-btn"
                  onClick={() => unarchiveOne(t.id)}
                  title="取消归档，回到任务列表"
                >
                  <Icon name="undo" size={14} />
                </button>
                <button
                  className="icon-btn danger"
                  onClick={() => setPending(t)}
                  title="彻底删除（含关联图片）"
                >
                  <Icon name="trash" size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {pending && (
        <ConfirmDialog
          message={`确认彻底删除任务「${pending.content || "空任务"}」？此操作不可撤销。`}
          onCancel={() => setPending(null)}
          onConfirm={() => {
            remove(pending.id);
            setPending(null);
          }}
        />
      )}
    </div>
  );
}
