import DOMPurify from "dompurify";
import { marked } from "marked";

marked.setOptions({
  breaks: true, // 单个换行当 <br>，符合"一行一个想法"的待办书写习惯
  gfm: true, // 含删除线 ~~text~~、任务列表等
});

/** 把 Markdown 源文本解析 + 消毒为可安全 dangerouslySetInnerHTML 的 HTML 字符串。 */
export function renderMarkdown(src: string): string {
  const html = marked.parse(src, { async: false }) as string;
  return DOMPurify.sanitize(html);
}

/** 渲染出的任务框（- [ ]）默认是 disabled，去掉才能点；点击由调用方接管，改的是源码。 */
export const enableTaskCheckboxes = (html: string) =>
  html.replace(/(<input[^>]*?) disabled=""/g, "$1");

// 任务清单项：（可选引用前缀）列表标记 + [ ] / [x] + 空白（marked 要求 ] 后有空格才认作任务框）
const CHECK_ITEM_RE = /^([ \t]*(?:>[ \t]?)*[ \t]*(?:[-*+]|\d{1,9}[.)])[ \t]+\[)([ xX])\](?=[ \t])/;
const FENCE_RE = /^ {0,3}(`{3,}|~{3,})/;

/** 源码里任务清单项所在的行号（代码块里的不算），顺序与渲染出的任务框一一对应。 */
function checklistLines(lines: string[]): number[] {
  const out: number[] = [];
  let inFence = false;
  lines.forEach((l, i) => {
    if (FENCE_RE.test(l)) inFence = !inFence;
    else if (!inFence && CHECK_ITEM_RE.test(l)) out.push(i);
  });
  return out;
}

/** 任务清单进度：已勾 / 总数。 */
export function checklistProgress(src: string): { done: number; total: number } {
  const lines = src.split("\n");
  const idx = checklistLines(lines);
  const done = idx.filter((i) => CHECK_ITEM_RE.exec(lines[i])![2] !== " ").length;
  return { done, total: idx.length };
}

/** 切换第 index 个任务框（与渲染顺序一致）。找不到返回 null。 */
export function toggleChecklistItem(src: string, index: number): string | null {
  const lines = src.split("\n");
  const line = checklistLines(lines)[index];
  if (line == null) return null;
  const m = CHECK_ITEM_RE.exec(lines[line])!;
  lines[line] = m[1] + (m[2] === " " ? "x" : " ") + lines[line].slice(m[1].length + 1);
  return lines.join("\n");
}

/** 按字符数截断 Markdown 源文本（可能截断语法中间，展示上可接受）。 */
export function truncateMarkdownSource(
  src: string,
  maxChars: number
): { text: string; truncated: boolean } {
  if (src.length <= maxChars) return { text: src, truncated: false };
  return { text: src.slice(0, maxChars), truncated: true };
}
