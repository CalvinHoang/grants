// Entry point when Electron starts the engine with utilityProcess.fork (§4.1).
// Main sends one MessagePort per window load; the renderer holds the other end. Nothing else can
// reach the engine. The engine is created once and every port is attached to it.
import type { Transport } from "@gw/shared";
import { createEngine } from "./engine";
import { storagePathsFromEnv } from "./storage/paths";

interface MessagePortLike {
  on(event: "message", listener: (e: { data: unknown }) => void): void;
  on(event: "close", listener: () => void): void;
  postMessage(message: unknown): void;
  start(): void;
  close(): void;
}
interface ParentPort {
  on(event: "message", listener: (e: { data: unknown; ports: MessagePortLike[] }) => void): void;
}

const parentPort = (process as unknown as { parentPort?: ParentPort }).parentPort;
if (!parentPort) {
  throw new Error("engine must be started by Electron utilityProcess");
}

// Main passes the app data folder (models.json, usage.db). GW_KEYSTORE=memory keeps keys in memory
// (Linux test containers have no Credential Manager); otherwise the OS keyring is used.
const appDataDir = process.argv.find((a) => a.startsWith("--app-data="))?.slice("--app-data=".length);
const engine = createEngine({
  appDataDir,
  keyStore: process.env.GW_KEYSTORE === "memory" ? "memory" : "auto",
  paths: storagePathsFromEnv(),
});

parentPort.on("message", (e) => {
  const port = e.ports[0];
  if (!port || (e.data as { type?: string } | null)?.type !== "engine-port") return;
  const transport: Transport = {
    send: (message) => port.postMessage(message),
    onMessage: (handler) => port.on("message", (m) => handler(m.data)),
    onClose: (handler) => port.on("close", handler),
    close: () => port.close(),
  };
  engine.attach(transport);
  port.start();
});
