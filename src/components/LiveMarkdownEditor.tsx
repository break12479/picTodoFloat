import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { enableTaskCheckboxes, renderMarkdown } from "../lib/markdown";
import {
  FENCE_RE,
  LIST_RE,
  applyFormatShortcut,
  backspaceListPrefix,
  continueList,
  headingLevel,
  indentListLines,
  isComposingKey,
  listIndentTarget,
  markupPrefixLength,
  replaceRange,
  splitLine,
} from "../lib/mdEdit";
import { openExternal } from "../lib/tauri";

/**
 * Obsidian 式实时预览编辑器：每一行（代码块、表格按整块）渲染成 Markdown，
 * 只有光标所在的那一块换成原生 <textarea> 显示源码。
 *
 * 为什么不用 CodeMirror：它基于 contenteditable 自己管理 DOM 和组字，之前实测搜狗输入法
 * 快速用空格上屏会丢字，去掉自定义装饰也没解决。这里输入始终发生在原生 textarea 里：
 * 打字只改这一块的文本，不重排其它块，也不碰 textarea 的 DOM，组字行为和普通输入框完全一样；
 * 回车拆行、退格合并、切换编辑块这些结构操作只在非组字状态下的按键 / 点击里发生。
 */

type Range = { from: number; to: number }; // 行号，闭区间
type BlockKind = "line" | "code" | "table";
interface Block extends Range {
  kind: BlockKind;
}
type SelDir = "forward" | "backward" | "none";
interface Snapshot {
  value: string;
  active: Range;
  caret: number;
}

const TABLE_DELIM_RE = /^ {0,3}\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;
const SUPPORTS_FIELD_SIZING =
  typeof CSS !== "undefined" && CSS.supports?.("field-sizing", "content");
// 连续打字在这个间隔内算同一步撤销
const UNDO_GROUP_MS = 1000;
const UNDO_LIMIT = 200;

const isFenceClose = (line: string, mark: string) => {
  const m = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(line);
  return !!m && m[1][0] === mark[0] && m[1].length >= mark.length;
};

/** 把 [lo, hi) 行切成块：``` 代码块、表格各成一块，其余每行一块。 */
function segment(lines: string[], lo: number, hi: number): Block[] {
  const out: Block[] = [];
  let i = lo;
  while (i < hi) {
    const fence = FENCE_RE.exec(lines[i]);
    if (fence) {
      let j = i + 1;
      while (j < hi && !isFenceClose(lines[j], fence[1])) j++;
      const to = Math.min(j, hi - 1); // 未闭合则到末尾
      out.push({ from: i, to, kind: "code" });
      i = to + 1;
      continue;
    }
    if (
      i + 1 < hi &&
      lines[i].includes("|") &&
      lines[i + 1].includes("|") &&
      TABLE_DELIM_RE.test(lines[i + 1])
    ) {
      let j = i + 2;
      while (j < hi && lines[j].includes("|")) j++;
      out.push({ from: i, to: j - 1, kind: "table" });
      i = j;
      continue;
    }
    out.push({ from: i, to: i, kind: "line" });
    i++;
  }
  return out;
}

/** 渲染一块。缩进的列表项单独渲染会丢掉嵌套关系（4 格以上还会变成代码块），改为去掉缩进、用左内边距表现层级。 */
function blockHtml(text: string, kind: BlockKind) {
  let src = text;
  let indent = 0;
  if (kind === "line") {
    const m = LIST_RE.exec(text);
    if (m?.[1]) {
      indent = m[1].replace(/\t/g, "    ").length;
      src = text.slice(m[1].length);
    }
  }
  // 任务框可点；点击由编辑器接管，改的是源码里的 [ ] / [x]
  const html = enableTaskCheckboxes(renderMarkdown(src));
  return { html, indent };
}

const BlockView = memo(function BlockView({
  from,
  to,
  kind,
  text,
}: Block & { text: string }) {
  const { html, indent } = useMemo(() => blockHtml(text, kind), [text, kind]);
  if (text.trim() === "") {
    return <div className="live-block live-empty" data-from={from} data-to={to} />;
  }
  return (
    <div
      className={`live-block md-content ${kind}`}
      data-from={from}
      data-to={to}
      style={indent ? { paddingLeft: `${indent * 0.6}em` } : undefined}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
});

/** 点击位置在渲染后纯文本里的偏移；拿不到返回 null。 */
function renderedOffsetAt(el: HTMLElement, x: number, y: number): number | null {
  let node: Node | null = null;
  let offset = 0;
  const doc = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  };
  if (doc.caretPositionFromPoint) {
    const p = doc.caretPositionFromPoint(x, y);
    if (p) ({ offsetNode: node, offset } = p);
  } else if (document.caretRangeFromPoint) {
    const r = document.caretRangeFromPoint(x, y);
    if (r) ({ startContainer: node, startOffset: offset } = r);
  }
  if (!node || !el.contains(node)) return null;
  const r = document.createRange();
  r.setStart(el, 0);
  r.setEnd(node, offset);
  return r.toString().length;
}

/** 把渲染文本里的偏移映射回源码：按顺序逐字匹配，跳过 ** # [ ]( 之类的标记字符。 */
function mapToSource(src: string, rendered: string, offset: number): number {
  let i = 0;
  for (const ch of rendered.slice(0, offset)) {
    const k = src.indexOf(ch, i);
    if (k < 0) return src.length;
    i = k + ch.length;
  }
  return Math.max(i, markupPrefixLength(src));
}

/** 光标在 textarea 里的视觉行顶部位置（镜像 div 测量，处理自动折行）。 */
function caretTop(ta: HTMLTextAreaElement, pos: number): number {
  const cs = getComputedStyle(ta);
  const div = document.createElement("div");
  const props = [
    "boxSizing", "width", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
    "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth",
    "fontFamily", "fontSize", "fontWeight", "fontStyle", "letterSpacing", "lineHeight",
    "textTransform", "wordSpacing", "textIndent", "tabSize", "wordBreak", "overflowWrap",
  ] as const;
  for (const p of props) div.style[p] = cs[p];
  Object.assign(div.style, {
    position: "absolute",
    visibility: "hidden",
    top: "0",
    left: "-9999px",
    whiteSpace: "pre-wrap",
  });
  div.textContent = ta.value.slice(0, pos);
  const marker = document.createElement("span");
  marker.textContent = ta.value.slice(pos) || ".";
  div.appendChild(marker);
  document.body.appendChild(div);
  const top = marker.offsetTop;
  div.remove();
  return top;
}

const offsetOfLine = (lines: string[], base: number, line: number) =>
  lines.slice(base, line).reduce((n, l) => n + l.length + 1, 0);

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}

export default function LiveMarkdownEditor({ value, onChange, placeholder, autoFocus }: Props) {
  const lines = useMemo(() => value.split("\n"), [value]);
  const [active, setActive] = useState<Range | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const pending = useRef<{ start: number; end: number; dir: SelDir } | null>(null);
  const composing = useRef(false);
  const caretBefore = useRef(0);
  const history = useRef({
    undo: [] as Snapshot[],
    redo: [] as Snapshot[],
    lastPush: 0,
    emitted: value,
  });

  // 内容变短（如保存后清空）时把编辑块夹回有效范围
  let act: Range | null = null;
  if (active) {
    const to = Math.min(active.to, lines.length - 1);
    act = { from: Math.min(active.from, to), to };
  }
  const before = act ? segment(lines, 0, act.from) : segment(lines, 0, lines.length);
  const after = act ? segment(lines, act.to + 1, lines.length) : [];
  const textOf = (r: Range) => lines.slice(r.from, r.to + 1).join("\n");
  const activeText = act ? textOf(act) : "";

  // 外部改了内容（如保存后清空）：撤销历史作废
  useEffect(() => {
    if (history.current.emitted !== value) {
      history.current = { undo: [], redo: [], lastPush: 0, emitted: value };
    }
  }, [value]);

  useLayoutEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    if (!SUPPORTS_FIELD_SIZING) {
      ta.style.height = "auto";
      ta.style.height = `${ta.scrollHeight}px`;
    }
    const p = pending.current;
    if (!p) return;
    pending.current = null;
    ta.focus({ preventScroll: true });
    ta.setSelectionRange(p.start, p.end, p.dir);
    ta.scrollIntoView({ block: "nearest" });
  });

  /** 切换编辑块并安排光标（渲染后在 layout effect 里落位）。 */
  const activate = (r: Range, start: number, end = start, dir: SelDir = "none") => {
    pending.current = { start, end, dir };
    setActive({ from: r.from, to: r.to });
  };

  useEffect(() => {
    if (!autoFocus) return;
    const all = segment(lines, 0, lines.length);
    const last = all[all.length - 1];
    activate(last, textOf(last).length);
  }, []); // 只在挂载时聚焦到末尾

  const spliceLines = (r: Range, repl: string[]) =>
    [...lines.slice(0, r.from), ...repl, ...lines.slice(r.to + 1)].join("\n");

  const pushUndo = (caret: number) => {
    if (!act) return;
    const h = history.current;
    h.undo.push({ value, active: act, caret });
    if (h.undo.length > UNDO_LIMIT) h.undo.shift();
  };

  /**
   * 写回内容。typing = 普通打字：间隔 UNDO_GROUP_MS 内的连续输入合并成一步撤销；
   * 组字中途不记撤销点（否则撤销会退回到半截拼音），组字开始时已经记过。
   */
  const emit = (next: string, nextActive: Range | null, typing = false) => {
    const h = history.current;
    const now = Date.now();
    if (!composing.current && (!typing || now - h.lastPush > UNDO_GROUP_MS)) {
      pushUndo(caretBefore.current);
    }
    h.lastPush = typing ? now : 0;
    h.redo = [];
    h.emitted = next;
    if (nextActive) setActive(nextActive);
    onChange(next);
  };

  const undoRedo = (dir: "undo" | "redo") => {
    const h = history.current;
    const snap = (dir === "undo" ? h.undo : h.redo).pop();
    if (!snap || !act) return;
    (dir === "undo" ? h.redo : h.undo).push({
      value,
      active: act,
      caret: taRef.current?.selectionStart ?? 0,
    });
    h.emitted = snap.value;
    h.lastPush = 0;
    const len = snap.value.split("\n").slice(snap.active.from, snap.active.to + 1).join("\n").length;
    activate(snap.active, Math.min(snap.caret, len));
    onChange(snap.value);
  };

  /** 把编辑块扩到 blk，选区从当前锚点延伸到 blk 里的 pos（Shift+点击 / Shift+方向键）。 */
  const extendTo = (blk: Range, pos: number) => {
    const ta = taRef.current;
    if (!act || !ta) return;
    const anchorLocal = ta.selectionDirection === "backward" ? ta.selectionEnd : ta.selectionStart;
    const r = { from: Math.min(act.from, blk.from), to: Math.max(act.to, blk.to) };
    const a = offsetOfLine(lines, r.from, act.from) + anchorLocal;
    const f = offsetOfLine(lines, r.from, blk.from) + pos;
    activate(r, Math.min(a, f), Math.max(a, f), f < a ? "backward" : "forward");
  };

  /** 编辑块跨了多块（粘贴多行、Ctrl+A、Shift 扩选后）且光标已折叠：收回到光标所在那一块，其余立刻渲染。 */
  const shrinkToCaret = () => {
    const ta = taRef.current;
    if (!ta || !act || composing.current || act.from === act.to) return;
    if (ta.selectionStart !== ta.selectionEnd) return;
    const caretLine = act.from + (ta.value.slice(0, ta.selectionStart).match(/\n/g)?.length ?? 0);
    const b = segment(lines, 0, lines.length).find((x) => x.from <= caretLine && caretLine <= x.to);
    if (!b || b.from < act.from || b.to > act.to || (b.from === act.from && b.to === act.to)) return;
    activate(b, ta.selectionStart - offsetOfLine(lines, act.from, b.from));
  };
  // 粘贴后要等内容写回、重新渲染完再收，届时得用最新一次渲染的闭包
  const shrinkRef = useRef(shrinkToCaret);
  shrinkRef.current = shrinkToCaret;

  const toggleTask = (line: number) => {
    const m = /^([ \t]*(?:[-*+]|\d{1,9}[.)])[ \t]+\[)([ xX])\]/.exec(lines[line]);
    if (!m) return;
    const next = m[1] + (m[2] === " " ? "x" : " ") + lines[line].slice(m[1].length + 1);
    emit(spliceLines({ from: line, to: line }, [next]), null);
  };

  const onTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (!act) return;
    const repl = e.target.value.split("\n");
    emit(spliceLines(act, repl), { from: act.from, to: act.from + repl.length - 1 }, true);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (isComposingKey(e) || !act) return;
    const ta = e.currentTarget;
    const { selectionStart: s, selectionEnd: en, value: text } = ta;
    caretBefore.current = s;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();

    // 撤销 / 重做按整篇算：切换编辑块后 textarea 自带的撤销栈就没了
    if (mod && !e.altKey && (k === "z" || k === "y")) {
      e.preventDefault();
      undoRedo(k === "y" || e.shiftKey ? "redo" : "undo");
      return;
    }
    if (mod && !e.altKey && !e.shiftKey && k === "a") {
      if (act.from === 0 && act.to === lines.length - 1) return;
      e.preventDefault();
      activate({ from: 0, to: lines.length - 1 }, 0, value.length);
      return;
    }
    if (applyFormatShortcut(e, ta)) {
      e.preventDefault();
      return;
    }
    if (mod || e.altKey) return; // Ctrl+Enter / Esc 等交给外层

    const collapsed = s === en;
    const prev = before[before.length - 1];
    const next = after[0];
    const single = act.from === act.to;

    switch (e.key) {
      case "Enter": {
        if (!single) {
          const fence = FENCE_RE.exec(text);
          const lastLine = text.slice(text.lastIndexOf("\n") + 1);
          if (fence && isFenceClose(lastLine, fence[1]) && collapsed && s === text.length) {
            // 已闭合代码块的末尾回车：在代码块下面起新行
            e.preventDefault();
            const line = act.to + 1;
            emit(spliceLines(act, [...text.split("\n"), ""]), { from: line, to: line });
            pending.current = { start: 0, end: 0, dir: "none" };
            return;
          }
          // 代码块里普通换行；Ctrl+A 等多行源码状态下照常续列表
          if (!fence && !e.shiftKey && continueList(ta)) e.preventDefault();
          return;
        }
        e.preventDefault();
        const fence = FENCE_RE.exec(text);
        if (fence && !e.shiftKey && collapsed && s === text.length) {
          // 敲完 ``` 回车：补上闭合行，光标进代码块
          emit(spliceLines(act, [text, "", fence[1]]), { from: act.from, to: act.from + 2 });
          pending.current = { start: text.length + 1, end: text.length + 1, dir: "none" };
          return;
        }
        // 拆行：上半行立刻渲染，光标去新行（Shift+Enter 不续列表）
        const r = splitLine(text.slice(0, s) + text.slice(en), s, !e.shiftKey);
        const line = act.from + r.caretLine;
        emit(spliceLines(act, r.lines), { from: line, to: line });
        pending.current = { start: r.caretCol, end: r.caretCol, dir: "none" };
        return;
      }
      case "Backspace": {
        if (!collapsed || e.shiftKey) return;
        if (backspaceListPrefix(ta)) {
          e.preventDefault();
          return;
        }
        if (s !== 0 || !prev) return;
        e.preventDefault();
        if (prev.kind !== "line") {
          activate(prev, textOf(prev).length); // 不和代码块 / 表格合并，只把光标移过去
          return;
        }
        // 行首退格：并到上一行末尾
        const prevLine = lines[prev.from];
        const repl = text.split("\n");
        repl[0] = prevLine + repl[0];
        emit(spliceLines({ from: prev.from, to: act.to }, repl), {
          from: prev.from,
          to: prev.from + repl.length - 1,
        });
        pending.current = { start: prevLine.length, end: prevLine.length, dir: "none" };
        return;
      }
      case "Delete": {
        if (!collapsed || s !== text.length || !next || next.kind !== "line") return;
        e.preventDefault();
        // 行尾 Delete：把下一行并上来
        const repl = text.split("\n");
        repl[repl.length - 1] += lines[next.from];
        emit(spliceLines({ from: act.from, to: next.to }, repl), {
          from: act.from,
          to: act.from + repl.length - 1,
        });
        pending.current = { start: s, end: s, dir: "none" };
        return;
      }
      case "ArrowUp":
      case "ArrowDown": {
        const up = e.key === "ArrowUp";
        const target = up ? prev : next;
        if (!target) return;
        const focusPos = e.shiftKey
          ? ta.selectionDirection === "backward" ? s : en
          : up ? s : en;
        // 只有光标在第一 / 最后一个视觉行时才跨块，否则交给 textarea 在折行之间移动
        const edge = up ? 0 : text.length;
        if (caretTop(ta, focusPos) !== caretTop(ta, edge)) return;
        e.preventDefault();
        const col = focusPos - (text.lastIndexOf("\n", focusPos - 1) + 1);
        const t = textOf(target);
        let pos: number;
        if (up) {
          const ls = t.lastIndexOf("\n") + 1;
          pos = ls + Math.min(col, t.length - ls);
        } else {
          const le = t.indexOf("\n");
          pos = Math.min(col, le < 0 ? t.length : le);
        }
        if (e.shiftKey) extendTo(target, pos);
        else activate(target, pos);
        return;
      }
      case "ArrowLeft":
        if (!collapsed || s !== 0 || !prev || e.shiftKey) return;
        e.preventDefault();
        activate(prev, textOf(prev).length);
        return;
      case "ArrowRight":
        if (!collapsed || s !== text.length || !next || e.shiftKey) return;
        e.preventDefault();
        activate(next, 0);
        return;
      case "Tab": {
        if (!single) {
          if (indentListLines(ta, e.shiftKey)) e.preventDefault();
          return;
        }
        const target = listIndentTarget(lines.slice(0, act.from), text, e.shiftKey);
        if (target == null) return;
        e.preventDefault();
        const ind = LIST_RE.exec(text)![1].length;
        const delta = target - ind;
        if (delta) {
          replaceRange(ta, 0, ind, " ".repeat(target), Math.max(0, s + delta), Math.max(0, en + delta));
        }
        return;
      }
    }
  };

  const onKeyUp = (e: React.KeyboardEvent) => {
    if (/^(Arrow|Home|End|Page)/.test(e.key)) shrinkToCaret();
  };

  const onRootMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0 || composing.current) return;
    const t = e.target as HTMLElement;
    if (t === taRef.current) return; // 编辑块内：交给原生光标
    const el = t.closest<HTMLElement>("[data-from]");
    if (!el) {
      // 空白处：落到最后一块末尾
      e.preventDefault();
      const all = segment(lines, 0, lines.length);
      const last = all[all.length - 1];
      activate(last, textOf(last).length);
      return;
    }
    const blk = { from: Number(el.dataset.from), to: Number(el.dataset.to) };
    if (t instanceof HTMLInputElement && t.type === "checkbox") {
      e.preventDefault();
      toggleTask(blk.from);
      return;
    }
    const link = t.closest("a");
    if (link && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      openExternal(link.getAttribute("href")).catch(() => {});
      return;
    }
    e.preventDefault();
    const src = textOf(blk);
    const off = renderedOffsetAt(el, e.clientX, e.clientY);
    const pos = off == null ? src.length : mapToSource(src, el.textContent ?? "", off);
    if (e.shiftKey && act) extendTo(blk, pos);
    else activate(blk, pos);
  };

  const inputClass = () => {
    const level = headingLevel(activeText);
    if (level) return ` h${level}`;
    return FENCE_RE.test(activeText) ? " code" : "";
  };

  return (
    <div
      className="live-editor"
      onMouseDown={onRootMouseDown}
      onClick={(e) => {
        const t = e.target as HTMLElement;
        // 链接只能 Ctrl+点击用外部浏览器打开，绝不让 WebView 自己跳走；
        // 任务框的勾选状态以源码为准（mousedown 时已改），别让原生 click 再翻一次
        if (t.closest("a") || (t instanceof HTMLInputElement && t.type === "checkbox")) {
          e.preventDefault();
        }
      }}
      onAuxClick={(e) => {
        if ((e.target as HTMLElement).closest("a")) e.preventDefault(); // 中键也不许开新窗口
      }}
    >
      {before.map((b) => (
        <BlockView key={`b${b.from}`} {...b} text={textOf(b)} />
      ))}
      {act ? (
        <textarea
          ref={taRef}
          key="active"
          className={`live-input${inputClass()}`}
          rows={1}
          value={activeText}
          placeholder={value === "" ? placeholder : undefined}
          spellCheck={false}
          onChange={onTextChange}
          onKeyDown={onKeyDown}
          onKeyUp={onKeyUp}
          onMouseUp={shrinkToCaret}
          onPaste={() => requestAnimationFrame(() => shrinkRef.current())}
          onCompositionStart={(e) => {
            composing.current = true;
            const h = history.current;
            if (Date.now() - h.lastPush > UNDO_GROUP_MS) {
              pushUndo(e.currentTarget.selectionStart);
              h.lastPush = Date.now();
            }
          }}
          onCompositionEnd={() => {
            composing.current = false;
          }}
        />
      ) : (
        value === "" && <div className="live-placeholder">{placeholder}</div>
      )}
      {after.map((b) => (
        // 以编辑块末行为基准的相对 key：打字导致行号整体平移时后面的块不重新挂载
        <BlockView key={`a${b.from - act!.to}`} {...b} text={textOf(b)} />
      ))}
    </div>
  );
}
