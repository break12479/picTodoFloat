import { WebviewWindow } from "@tauri-apps/api/webviewWindow";

import type { TaskImage } from "../types";

/** 打开一个 PixPin 式的独立悬浮小窗，只显示这张图片。 */
export function openPinWindow(img: TaskImage) {
  const label = `pin-${img.id}-${Date.now()}`;
  new WebviewWindow(label, {
    url: `index.html?pin=1&id=${img.id}&src=${encodeURIComponent(img.file_path)}`,
    title: "PicTodo Pin",
    decorations: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    // 禁用原生可调整大小：缩放靠滚轮 setSize() 编程式实现，不依赖系统边框拖拽；
    // 顺带避免拖到屏幕边缘触发 Windows 半屏/贴靠（Snap 只对可调整大小的窗口生效）。
    resizable: false,
    maximizable: false,
    shadow: false,
    width: 480,
    height: 360,
    center: true,
  });
}
