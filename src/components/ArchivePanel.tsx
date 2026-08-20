import { useEffect, useState } from "react";

import { useTaskStore } from "../stores/taskStore";
import type { Task } from "../types";
import ConfirmDialog from "./ConfirmDialog";

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

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="archive-panel" onClick={(e) => e.stopPropagation()}>
        <header className="settings-head">
          <span>归档任务 ({archivedTasks.length})</span>
          <button className="win-btn" onClick={onClose} title="关闭">
            ×
          </button>
        </header>

        <div className="archive-body">
          {archivedTasks.length === 0 && (
            <div className="group-empty">暂无归档任务</div>
          )}
          {archivedTasks.map((t) => (
            <div key={t.id} className="archive-item">
              <span className="archive-item-text">
                {t.content || "（空任务）"}
              </span>
              <span className="archive-item-date">
                {t.archived_at?.slice(0, 10)}
              </span>
              <div className="archive-item-actions">
                <button
                  className="btn ghost"
                  onClick={() => unarchiveOne(t.id)}
                  title="取消归档，回到任务列表"
                >
                  取消归档
                </button>
                <button
                  className="btn danger"
                  onClick={() => setPending(t)}
                  title="彻底删除（含关联图片）"
                >
                  删除
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
