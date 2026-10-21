import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";

import { invoke } from "../lib/tauri";
import { useTaskStore } from "../stores/taskStore";
import type { Task } from "../types";
import ConfirmDialog from "./ConfirmDialog";
import Icon from "./Icon";

interface Props {
  task: Task;
}

/**
 * 📄 关联文档：无文档→关联/新建；有文档→点击打开、右键菜单可更换 / 解除关联；断链→红点+重新关联。
 * 解除关联要二次确认：它会在文档末尾追加一行备注（以前是长按 0.55 秒直接解除，容易误触且无法撤销）。
 */
export default function DocButton({ task }: Props) {
  const linkDoc = useTaskStore((s) => s.linkDoc);
  const createDoc = useTaskStore((s) => s.createDoc);
  const openDoc = useTaskStore((s) => s.openDoc);
  const unlinkDoc = useTaskStore((s) => s.unlinkDoc);

  const [broken, setBroken] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmUnlink, setConfirmUnlink] = useState(false);

  const hasDoc = !!task.doc_path;
  const docName = task.doc_path?.split(/[\\/]/).pop() ?? "";

  useEffect(() => {
    let alive = true;
    if (!task.doc_path) {
      setBroken(false);
      return;
    }
    invoke<boolean>("check_doc_exists", { taskId: task.id })
      .then((exists) => alive && setBroken(!exists))
      .catch(() => alive && setBroken(false));
    return () => {
      alive = false;
    };
  }, [task.id, task.doc_path]);

  const handleClick = () => {
    if (hasDoc && !broken) openDoc(task.id);
    else setMenuOpen((o) => !o);
  };

  const pickAndLink = async () => {
    setMenuOpen(false);
    const selected = await open({
      multiple: false,
      filters: [{ name: "Markdown", extensions: ["md", "markdown"] }],
    });
    if (typeof selected === "string") {
      await linkDoc(task.id, selected);
      setBroken(false);
    }
  };

  const create = async () => {
    setMenuOpen(false);
    await createDoc(task.id, task.content || "未命名");
    setBroken(false);
  };

  const cls = broken ? "broken" : hasDoc ? "linked" : "";
  const title = broken
    ? "文档断链，点击重新关联"
    : hasDoc
    ? `打开「${docName}」 · 右键更换 / 解除关联`
    : "关联 / 新建文档";

  return (
    <div className="doc-wrap">
      <button
        className={`icon-btn doc-btn ${cls}`}
        title={title}
        aria-label={title}
        onClick={handleClick}
        onContextMenu={(e) => {
          // 自己的菜单，不弹任务菜单
          e.preventDefault();
          e.stopPropagation();
          if (hasDoc) setMenuOpen(true);
        }}
      >
        <Icon name="file" size={15} />
        {broken && <span className="doc-broken-badge">!</span>}
      </button>

      {menuOpen && (
        <>
          <div className="popover-backdrop" onClick={() => setMenuOpen(false)} />
          <div className="doc-menu popover">
            {!hasDoc && (
              <>
                <button className="popover-item" onClick={pickAndLink}>
                  关联已有 .md
                </button>
                <button className="popover-item" onClick={create}>
                  新建文档
                </button>
              </>
            )}
            {hasDoc && !broken && (
              <button
                className="popover-item"
                onClick={() => {
                  setMenuOpen(false);
                  openDoc(task.id);
                }}
              >
                打开文档
              </button>
            )}
            {hasDoc && (
              <>
                <button className="popover-item" onClick={pickAndLink}>
                  {broken ? "重新关联" : "更换文档…"}
                </button>
                <button
                  className="popover-item danger"
                  onClick={() => {
                    setMenuOpen(false);
                    setConfirmUnlink(true);
                  }}
                >
                  {broken ? "移除关联" : "解除关联…"}
                </button>
              </>
            )}
          </div>
        </>
      )}

      {confirmUnlink && (
        <ConfirmDialog
          message={
            broken
              ? `移除与「${docName}」的关联？（文档已不存在）`
              : `解除与「${docName}」的关联？文档不会被删除，但会在它末尾追加一行「已断联」备注。`
          }
          confirmText={broken ? "移除关联" : "解除关联"}
          onCancel={() => setConfirmUnlink(false)}
          onConfirm={() => {
            setConfirmUnlink(false);
            unlinkDoc(task.id);
          }}
        />
      )}
    </div>
  );
}
