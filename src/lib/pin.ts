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
    resizable: true,
    shadow: false,
    width: 480,
    height: 360,
    center: true,
  });
}
