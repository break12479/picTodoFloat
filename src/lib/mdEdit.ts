/**
 * Markdown 编辑辅助：加粗 / 斜体 / 链接、列表续行、列表缩进等，只操作原生 <textarea>。
 *
 * 便签曾用 CodeMirror（contenteditable）做实时预览，搜狗输入法快速用空格上屏时会丢字。
 * 这里所有编辑都落在原生 textarea 上，组字全程交给浏览器；组字中（isComposing）的按键一律不介入。
 * 文本改动走 execCommand("insertText")：会触发正常的 input 事件（React onChange 照常工作），
 * 也会进入 textarea 自带的撤销栈。
 */

/** 输入法组字中的按键（含上屏用的空格 / 回车 / Esc）：一律放行，不做任何处理。 */
export const isComposingKey = (e: React.KeyboardEvent) =>
  e.nativeEvent.isComposing || e.keyCode === 229;

/** 列表项前缀：缩进 + 标记（- * + 1. 1)）+ 空白 + 可选任务框。 */
export const LIST_RE = /^([ \t]*)([-*+]|\d{1,9}[.)])([ \t]+)(\[[ xX]\][ \t]+)?/;
const QUOTE_RE = /^[ \t]*(?:>[ \t]?)+/;
const HEADING_RE = /^ {0,3}(#{1,6})[ \t]+/;
export const FENCE_RE = /^ {0,3}(`{3,}|~{3,})/;

/** 标题级别（1~6），不是标题行返回 0。 */
export const headingLevel = (line: string) => HEADING_RE.exec(line)?.[1].length ?? 0;

/** 行首 Markdown 标记（标题 # / 列表 / 引用）的长度，没有则 0。 */
export const markupPrefixLength = (line: string) =>
  (HEADING_RE.exec(line) ?? LIST_RE.exec(line) ?? QUOTE_RE.exec(line))?.[0].length ?? 0;

interface LinePrefix {
  /** 当前行的前缀原文 */
  text: string;
  /** 回车续行时新行的前缀（有序列表序号 +1，任务框重置为未完成） */
  next: string;
}

function linePrefix(line: string): LinePrefix | null {
  const m = LIST_RE.exec(line);
  if (m) {
    const [text, indent, marker, gap, task] = m;
    const num = /\d/.test(marker[0])
      ? `${parseInt(marker, 10) + 1}${marker.slice(-1)}`
      : marker;
    return { text, next: indent + num + gap + (task ? "[ ] " : "") };
  }
  const q = QUOTE_RE.exec(line);
  return q ? { text: q[0], next: q[0] } : null;
}

/**
 * 在第 pos 列回车，返回拆出来的行与光标落点。
 * 列表 / 引用自动续上前缀；空的列表项回车则去掉标记（结束列表）。
 */
export function splitLine(
  line: string,
  pos: number,
  continuePrefix = true
): { lines: string[]; caretLine: number; caretCol: number } {
  const p = continuePrefix ? linePrefix(line) : null;
  if (p && pos >= p.text.length) {
    if (line.slice(p.text.length).trim() === "") {
      return { lines: [""], caretLine: 0, caretCol: 0 };
    }
    const rest = line.slice(pos).replace(/^[ \t]+/, "");
    return {
      lines: [line.slice(0, pos), p.next + rest],
      caretLine: 1,
      caretCol: p.next.length,
    };
  }
  return { lines: [line.slice(0, pos), line.slice(pos)], caretLine: 1, caretCol: 0 };
}

/**
 * Tab / Shift+Tab：列表行的新缩进（空格数）；不是列表行返回 null。
 * 缩进到上一个同级项的正文位置（"- " 是 2 格、"1. " 是 3 格），这样才会被解析成嵌套列表；
 * 反缩进回到父级项的缩进。
 */
export function listIndentTarget(
  prevLines: string[],
  line: string,
  outdent: boolean
): number | null {
  const m = LIST_RE.exec(line);
  if (!m) return null;
  const cur = m[1].length;
  for (let i = prevLines.length - 1; i >= 0; i--) {
    const pm = LIST_RE.exec(prevLines[i]);
    if (!pm) {
      // 顶格的普通段落：列表到此为止
      if (prevLines[i].trim() !== "" && !/^[ \t]/.test(prevLines[i])) break;
      continue;
    }
    const ind = pm[1].length;
    if (outdent) {
      if (ind < cur) return ind;
    } else if (ind <= cur) {
      return ind === cur ? ind + pm[2].length + pm[3].length : cur;
    }
  }
  return outdent ? 0 : cur;
}

const shiftIndent = (line: string, delta: number) => {
  const ind = /^[ \t]*/.exec(line)![0].length;
  return " ".repeat(Math.max(0, ind + delta)) + line.slice(ind);
};

/** 光标前的文本是否落在未闭合的 ``` 代码块里（代码里不做列表续行）。 */
function insideFence(textBefore: string): boolean {
  let open = false;
  for (const l of textBefore.split("\n")) if (FENCE_RE.test(l)) open = !open;
  return open;
}

/** 用 text 替换 textarea 的 [start, end)，再把选区设为 [selStart, selEnd]。 */
export function replaceRange(
  ta: HTMLTextAreaElement,
  start: number,
  end: number,
  text: string,
  selStart = start + text.length,
  selEnd = selStart
) {
  ta.focus();
  ta.setSelectionRange(start, end);
  const ok = text
    ? document.execCommand("insertText", false, text)
    : start === end || document.execCommand("delete");
  if (!ok) {
    ta.setRangeText(text, start, end, "end");
    ta.dispatchEvent(new Event("input", { bubbles: true }));
  }
  ta.setSelectionRange(selStart, selEnd);
}

/** 用 before/after 包裹选区；已经包着则去掉（再按一次 Ctrl+B 取消加粗）。 */
function toggleWrap(ta: HTMLTextAreaElement, before: string, after = before) {
  const { value, selectionStart: s, selectionEnd: e } = ta;
  const sel = value.slice(s, e);
  const bl = before.length;
  // 外侧是 "**" 时那是加粗，不当作斜体的 "*" 去掉（"***" 才是加粗+斜体）
  const boldNotItalic = before === "*" && value[s - 2] === "*" && value[s - 3] !== "*";
  if (
    s >= bl &&
    !boldNotItalic &&
    value.slice(s - bl, s) === before &&
    value.slice(e, e + after.length) === after
  ) {
    replaceRange(ta, s - bl, e + after.length, sel, s - bl, e - bl);
    return;
  }
  if (sel.length >= bl + after.length && sel.startsWith(before) && sel.endsWith(after)) {
    const inner = sel.slice(bl, sel.length - after.length);
    replaceRange(ta, s, e, inner, s, s + inner.length);
    return;
  }
  replaceRange(ta, s, e, before + sel + after, s + bl, s + bl + sel.length);
}

/** Ctrl+K：选中的是网址 → [](网址) 光标进方括号；否则 [文字](url) 并选中 url 占位。 */
function insertLink(ta: HTMLTextAreaElement) {
  const { value, selectionStart: s, selectionEnd: e } = ta;
  const sel = value.slice(s, e);
  if (/^(https?:\/\/|mailto:)\S+$/.test(sel)) {
    replaceRange(ta, s, e, `[](${sel})`, s + 1);
  } else {
    const urlAt = s + sel.length + 3;
    replaceRange(ta, s, e, `[${sel}](url)`, urlAt, urlAt + 3);
  }
}

/** 格式快捷键：Ctrl+B 加粗、Ctrl+I 斜体、Ctrl+E 行内代码、Ctrl+Shift+X 删除线、Ctrl+K 链接。 */
export function applyFormatShortcut(
  e: React.KeyboardEvent<HTMLTextAreaElement>,
  ta: HTMLTextAreaElement
): boolean {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return false;
  const k = e.key.toLowerCase();
  if (e.shiftKey) {
    if (k !== "x") return false;
    toggleWrap(ta, "~~");
    return true;
  }
  if (k === "b") toggleWrap(ta, "**");
  else if (k === "i") toggleWrap(ta, "*");
  else if (k === "e") toggleWrap(ta, "`");
  else if (k === "k") insertLink(ta);
  else return false;
  return true;
}

const lineBounds = (value: string, pos: number) => {
  const start = value.lastIndexOf("\n", pos - 1) + 1;
  const nl = value.indexOf("\n", pos);
  return { start, end: nl < 0 ? value.length : nl };
};

/** 回车续行：列表 / 引用行自动带上前缀，空项回车结束列表。不适用时返回 false（走默认换行）。 */
export function continueList(ta: HTMLTextAreaElement): boolean {
  const { value, selectionStart: s, selectionEnd: e } = ta;
  if (s !== e) return false;
  const { start, end } = lineBounds(value, s);
  if (insideFence(value.slice(0, start))) return false;
  const line = value.slice(start, end);
  const p = linePrefix(line);
  if (!p || s - start < p.text.length) return false;
  if (line.slice(p.text.length).trim() === "") {
    replaceRange(ta, start, end, "");
    return true;
  }
  const ws = /^[ \t]*/.exec(value.slice(s, end))![0].length;
  replaceRange(ta, s, s + ws, "\n" + p.next);
  return true;
}

/** Tab / Shift+Tab：缩进 / 反缩进选中的列表行。光标不在列表行时返回 false。 */
export function indentListLines(ta: HTMLTextAreaElement, outdent: boolean): boolean {
  const { value, selectionStart: s, selectionEnd: e } = ta;
  const lines = value.split("\n");
  const first = value.slice(0, s).split("\n").length - 1;
  const last = value.slice(0, e).split("\n").length - 1;
  const target = listIndentTarget(lines.slice(0, first), lines[first], outdent);
  if (target == null) return false;
  const delta = target - LIST_RE.exec(lines[first])![1].length;
  if (delta === 0) return true; // 吞掉 Tab，别让焦点跳走
  const blockStart = lines.slice(0, first).reduce((n, l) => n + l.length + 1, 0);
  const oldBlock = lines.slice(first, last + 1);
  const newBlock = oldBlock
    .map((l) => (LIST_RE.test(l) ? shiftIndent(l, delta) : l))
    .join("\n");
  const blockEnd = blockStart + oldBlock.join("\n").length;
  if (first === last) {
    replaceRange(
      ta,
      blockStart,
      blockEnd,
      newBlock,
      Math.max(blockStart, s + delta),
      Math.max(blockStart, e + delta)
    );
  } else {
    replaceRange(ta, blockStart, blockEnd, newBlock, blockStart, blockStart + newBlock.length);
  }
  return true;
}

/** 光标紧跟在列表 / 引用标记后按退格：整个标记一起去掉（保留缩进），而不是只删一个空格。 */
export function backspaceListPrefix(ta: HTMLTextAreaElement): boolean {
  const { value, selectionStart: s, selectionEnd: e } = ta;
  if (s !== e) return false;
  const { start, end } = lineBounds(value, s);
  const line = value.slice(start, end);
  const m = LIST_RE.exec(line) ?? QUOTE_RE.exec(line);
  if (!m || s - start !== m[0].length) return false;
  const indent = /^[ \t]*/.exec(line)![0].length;
  replaceRange(ta, start + indent, s, "");
  return true;
}

/**
 * 普通 textarea（便签源码模式、底部紧凑输入框）的 Markdown 按键处理。
 * 处理了返回 true，调用方据此 preventDefault。
 * newline：哪个回车是"换行"（便签里是 Enter；紧凑输入框里 Enter 是提交，Shift+Enter 才换行）。
 */
export function handleMarkdownKey(
  e: React.KeyboardEvent<HTMLTextAreaElement>,
  opts: { newline: "enter" | "shift-enter"; tab?: boolean }
): boolean {
  if (isComposingKey(e)) return false;
  const ta = e.currentTarget;
  if (applyFormatShortcut(e, ta)) return true;
  if (e.ctrlKey || e.metaKey || e.altKey) return false;
  if (e.key === "Enter" && e.shiftKey === (opts.newline === "shift-enter")) {
    return continueList(ta);
  }
  if (e.key === "Tab" && opts.tab) return indentListLines(ta, e.shiftKey);
  if (e.key === "Backspace" && !e.shiftKey) return backspaceListPrefix(ta);
  return false;
}
