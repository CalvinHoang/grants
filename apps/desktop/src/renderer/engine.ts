// The UI's connection to the engine: the MessagePort from the preload, wrapped in the shared RPC
// client. The main process sends a new port after an engine restart; the client stays the same
// and requests that were in flight on the old port fail with `closed`.
import { createRpcClient, type RpcClient, type Transport } from "@gw/shared";

export interface EngineConnection {
  client: RpcClient;
  /** Resolves when the first port arrives. */
  ready: Promise<void>;
  /** Called each time a port arrives, including replacements after an engine restart. */
  onConnect(handler: () => void): void;
}

export function connectEngine(): EngineConnection {
  let port: MessagePort | null = null;
  let receive: (message: unknown) => void = () => {};
  const closeHandlers: (() => void)[] = [];
  const connectHandlers: (() => void)[] = [];
  let markReady: () => void = () => {};
  const ready = new Promise<void>((resolve) => (markReady = resolve));

  const transport: Transport = {
    send: (message) => {
      if (!port) throw new Error("engine not connected");
      port.postMessage(message);
    },
    onMessage: (handler) => {
      receive = handler;
    },
    onClose: (handler) => {
      closeHandlers.push(handler);
    },
  };
  const client = createRpcClient(transport);

  window.addEventListener("message", (event: MessageEvent) => {
    if (event.source !== window || (event.data as { type?: string } | null)?.type !== "engine-port") return;
    const next = event.ports[0];
    if (!next) return;
    if (port) {
      port.onmessage = null;
      port.close();
      for (const h of closeHandlers) h();
    }
    port = next;
    port.onmessage = (e) => receive(e.data);
    markReady();
    for (const h of connectHandlers) h();
  });

  return {
    client,
    ready,
    onConnect: (handler) => {
      connectHandlers.push(handler);
    },
  };
}
