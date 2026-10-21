import {
  invoke as tauriInvoke,
  convertFileSrc,
  type InvokeArgs,
  type InvokeOptions,
} from "@tauri-apps/api/core";

/**
 * 薄封装：统一 invoke 入口，便于集中处理错误/日志。返回 Result 由调用方 try/catch。
 * args 传 Uint8Array 时走原始二进制 IPC（附带参数放 options.headers）。
 */
export async function invoke<T>(
  cmd: string,
  args?: InvokeArgs,
  options?: InvokeOptions
): Promise<T> {
  return tauriInvoke<T>(cmd, args, options);
}

/**
 * 用系统默认程序打开链接（opener 插件，默认权限只放行 http/https/mailto/tel）。
 * Markdown 里的 <a> 不能让 WebView 自己跳转：无边框窗口没有后退键，主界面会被网页整个替换掉。
 */
export async function openExternal(url: string | null | undefined) {
  if (!url || !/^(https?:|mailto:)/i.test(url)) return;
  await tauriInvoke("plugin:opener|open_url", { url });
}

export { convertFileSrc };
