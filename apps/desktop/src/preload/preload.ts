// Preload (sandboxed, context-isolated). Its only job: pass the engine's MessagePort from main to
// the page. The page gets no Node or Electron API.
import { ipcRenderer } from "electron";

ipcRenderer.on("engine-port", (event) => {
  const [port] = event.ports;
  if (port) window.postMessage({ type: "engine-port" }, window.location.origin, [port]);
});
