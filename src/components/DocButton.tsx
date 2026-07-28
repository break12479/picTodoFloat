import { useEffect, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";

import { invoke } from "../lib/tauri";
import { useTaskStore } from "../stores/taskStore";
import type { Task } from "../types";

interface Props {
  task: Task;
}

const LONG_PRESS_MS = 550;

/** 📄 关联文档：无文档→关联/新建；有文档→点击打开、长按取消关联；断链→红点+重新关联。 */
export default function DocButton({ task }: Props) {
  const linkDoc = useTaskStore((s) => s.linkDoc);
  const createDoc = useTaskStore((s) => s.createDoc);
  const openDoc = useTaskStore((s) => s.openDoc);
  const unlinkDoc = useTaskStore((s) => s.unlinkDoc);

  const [broken, setBroken] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const timer = useRef<number | null>(null);
  const longFired = useRef(false);

  const hasDoc = !!task.doc_path;

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

  const clearTimer = () => {
    if (timer.current != null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  };

  // 长按（仅在已关联时）→ 取消关联
  const onPointerDown = () => {
    if (!hasDoc) return;
    longFired.current = false;
    timer.current = window.setTimeout(() => {
      longFired.current = true;
      unlinkDoc(task.id);
    }, LONG_PRESS_MS);
  };
  const onPointerUp = () => clearTimer();
  const onPointerLeave = () => clearTimer();

  const handleClick = () => {
    if (longFired.current) {
      longFired.current = false; // 长按已处理，吞掉本次 click
      return;
    }
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
    ? "点击打开 · 长按取消关联"
    : "关联 / 新建文档";

  return (
    <div className="doc-wrap">
      <button
        className={`doc-btn ${cls}`}
        title={title}
        onClick={handleClick}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerLeave}
      >
        📄
        {broken && <span className="doc-broken-badge">!</span>}
      </button>

      {menuOpen && (
        <>
          <div className="doc-menu-backdrop" onClick={() => setMenuOpen(false)} />
          <div className="doc-menu">
            {!hasDoc && (
              <>
                <button onClick={pickAndLink}>关联已有 .md</button>
                <button onClick={create}>新建文档</button>
              </>
            )}
            {hasDoc && broken && (
              <>
                <button onClick={pickAndLink}>重新关联</button>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    unlinkDoc(task.id);
                  }}
                >
                  移除关联
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
