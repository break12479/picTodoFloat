import { invoke as tauriInvoke, convertFileSrc } from "@tauri-apps/api/core";

/** 薄封装：统一 invoke 入口，便于集中处理错误/日志。返回 Result 由调用方 try/catch。 */
export async function invoke<T>(
  cmd: string,
  args?: Record<string, unknown>
): Promise<T> {
  return tauriInvoke<T>(cmd, args);
}

export { convertFileSrc };
