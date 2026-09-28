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

/** 按字符数截断 Markdown 源文本（可能截断语法中间，展示上可接受）。 */
export function truncateMarkdownSource(
  src: string,
  maxChars: number
): { text: string; truncated: boolean } {
  if (src.length <= maxChars) return { text: src, truncated: false };
  return { text: src.slice(0, maxChars), truncated: true };
}
