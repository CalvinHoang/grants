import { describe, expect, it } from "vitest";
import { createMemoryTransportPair, createRpcClient, SCHEMA_VERSION } from "@gw/shared";
import { createEngine } from "./engine";

describe("engine under plain Node", () => {
  it("answers settings.engineInfo", async () => {
    const [ui, engine] = createMemoryTransportPair();
    createEngine().attach(engine);
    const client = createRpcClient(ui, { timeoutMs: 2000 });
    const info = await client.request("settings.engineInfo", {});
    expect(info.schemaVersion).toBe(SCHEMA_VERSION);
    expect(info.node).toBe(process.versions.node);
    expect(info.sqlite).toMatch(/^3\./);
  });

  it("serves a new connection after the first one closes", async () => {
    const engine = createEngine();
    const [ui1, e1] = createMemoryTransportPair();
    engine.attach(e1);
    const client1 = createRpcClient(ui1);
    await client1.request("settings.engineInfo", {});
    client1.close();

    const [ui2, e2] = createMemoryTransportPair();
    engine.attach(e2);
    const client2 = createRpcClient(ui2);
    const lines: string[] = [];
    client2.on("progress", (p) => lines.push(p.line));
    await expect(client2.request("settings.engineInfo", {})).resolves.toMatchObject({ schemaVersion: 1 });
    engine.emit("progress", { applicationId: null, runId: null, line: "ok", done: null, total: null });
    await new Promise((r) => setTimeout(r, 10));
    expect(lines).toEqual(["ok"]);
  });
});
