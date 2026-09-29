import { describe, expect, it, vi } from "vitest";
import {
  createMemoryTransportPair,
  createRpcClient,
  createRpcServer,
  RpcError,
  type Handlers,
  type Transport,
} from "./index";

const info = { engineVersion: "0.0.0", schemaVersion: 1, node: "24.0.0", sqlite: "3.50.0", platform: "linux", pid: 1234, keyStore: "memory" as const };

function connect(handlers: Handlers) {
  const [uiSide, engineSide] = createMemoryTransportPair();
  const server = createRpcServer(handlers);
  server.attach(engineSide);
  const client = createRpcClient(uiSide, { timeoutMs: 1000 });
  return { client, server, uiSide, engineSide };
}

describe("rpc", () => {
  it("round-trips a request", async () => {
    const { client } = connect({ "settings.engineInfo": () => info });
    await expect(client.request("settings.engineInfo", {})).resolves.toEqual(info);
  });

  it("answers not_implemented for declared methods without a handler", async () => {
    const { client } = connect({});
    await expect(client.request("project.list", {})).rejects.toMatchObject({ code: "not_implemented" });
  });

  it("rejects invalid params before sending", async () => {
    const { client } = connect({});
    // @ts-expect-error clientName is required
    await expect(client.request("project.create", { packageId: "crcp-r19" })).rejects.toMatchObject({
      code: "invalid_params",
    });
  });

  it("validates params on the server too", async () => {
    const [uiSide, engineSide] = createMemoryTransportPair();
    createRpcServer({ "project.create": () => { throw new Error("must not run"); } }).attach(engineSide);
    const reply = new Promise((resolve) => uiSide.onMessage(resolve));
    uiSide.send({ type: "request", id: 7, method: "project.create", params: { packageId: "Bad Id!" } });
    await expect(reply).resolves.toMatchObject({ id: 7, ok: false, error: { code: "invalid_params" } });
  });

  it("never echoes rejected values in error messages", async () => {
    const [uiSide, engineSide] = createMemoryTransportPair();
    createRpcServer({}).attach(engineSide);
    const reply = new Promise<{ error: { message: string } }>((resolve) =>
      uiSide.onMessage((m) => resolve(m as { error: { message: string } })),
    );
    uiSide.send({ type: "request", id: 1, method: "settings.setKey", params: { provider: "x", key: 12345678 } });
    const { error } = await reply;
    expect(error.message).toContain("key");
    expect(error.message).not.toContain("12345678");
  });

  it("rejects a result that breaks its schema", async () => {
    const { client } = connect({
      // @ts-expect-error deliberately wrong result
      "settings.engineInfo": () => ({ engineVersion: "" }),
    });
    await expect(client.request("settings.engineInfo", {})).rejects.toMatchObject({ code: "invalid_result" });
  });

  it("passes RpcError codes through, including domain codes", async () => {
    const { client } = connect({
      "project.list": () => {
        throw new RpcError("not_found", "no such application");
      },
    });
    await expect(client.request("project.list", {})).rejects.toMatchObject({
      code: "not_found",
      message: "no such application",
    });
  });

  it("hides the message of unexpected handler errors", async () => {
    const { client } = connect({
      "run.status": () => {
        throw new Error("ENOENT: C:\\Clients\\Harbour\\plan.pdf");
      },
    });
    const err = await client.request("run.status", { applicationId: "a" }).catch((e: RpcError) => e);
    expect(err).toMatchObject({ code: "internal", message: "internal error" });
  });

  it("fails a request at once when its response is malformed", async () => {
    const [uiSide, engineSide] = createMemoryTransportPair();
    engineSide.onMessage((m) => {
      const { id } = m as { id: number };
      engineSide.send({ type: "response", id, ok: false, error: { message: 42 } });
    });
    const client = createRpcClient(uiSide, { timeoutMs: 5000 });
    const started = Date.now();
    await expect(client.request("project.list", {})).rejects.toMatchObject({ code: "invalid_message" });
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it("uses the method's own timeout", async () => {
    const silent: Transport = { send() {}, onMessage() {} };
    const client = createRpcClient(silent, { timeoutMs: 10 });
    const settled = vi.fn();
    vi.useFakeTimers();
    try {
      client.request("chat.send", { applicationId: "a", itemId: { kind: "overall" }, text: "hi" }).catch(settled);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(settled).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(300_000);
      expect(settled).toHaveBeenCalledWith(expect.objectContaining({ code: "timeout" }));
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects pending requests when the connection closes", async () => {
    const [uiSide, engineSide] = createMemoryTransportPair();
    engineSide.onMessage(() => {}); // never answers
    const client = createRpcClient(uiSide);
    const pending = client.request("project.list", {});
    engineSide.close?.();
    await expect(pending).rejects.toMatchObject({ code: "closed" });
  });

  it("answers unknown methods", async () => {
    const [uiSide, engineSide] = createMemoryTransportPair();
    createRpcServer({}).attach(engineSide);
    const reply = new Promise((resolve) => uiSide.onMessage(resolve));
    uiSide.send({ type: "request", id: 3, method: "nope.nothing", params: {} });
    await expect(reply).resolves.toMatchObject({ id: 3, ok: false, error: { code: "unknown_method" } });
  });

  it("times out when the engine never replies", async () => {
    const silent: Transport = { send() {}, onMessage() {} };
    const client = createRpcClient(silent, { timeoutMs: 20 });
    await expect(client.request("project.list", {})).rejects.toMatchObject({ code: "timeout" });
  });

  it("rejects pending requests on close", async () => {
    const silent: Transport = { send() {}, onMessage() {} };
    const client = createRpcClient(silent);
    const pending = client.request("project.list", {});
    client.close();
    await expect(pending).rejects.toMatchObject({ code: "closed" });
  });

  it("delivers valid events and drops invalid ones", async () => {
    const { client, server, engineSide } = connect({});
    const lines: string[] = [];
    const off = client.on("progress", (p) => lines.push(p.line));
    server.emit("progress", { applicationId: null, runId: null, line: "34 of 60 fields done", done: 34, total: 60 });
    engineSide.send({ type: "event", event: "progress", payload: { line: 5 } });
    engineSide.send({ type: "event", event: "no.such.event", payload: {} });
    await new Promise((r) => setTimeout(r, 10));
    expect(lines).toEqual(["34 of 60 fields done"]);
    off();
    server.emit("progress", { applicationId: null, runId: null, line: "again", done: null, total: null });
    await new Promise((r) => setTimeout(r, 10));
    expect(lines).toHaveLength(1);
  });

  it("refuses to emit an invalid event", () => {
    const { server } = connect({});
    // @ts-expect-error deliberately wrong payload
    expect(() => server.emit("progress", { line: 1 })).toThrow();
  });
});
