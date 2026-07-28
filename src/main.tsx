import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import PinView from "./components/PinView";
import "./styles.css";

// pin 悬浮窗与主窗共用同一份构建，靠 URL 参数区分
const isPin = new URLSearchParams(window.location.search).get("pin") === "1";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>{isPin ? <PinView /> : <App />}</React.StrictMode>
);
