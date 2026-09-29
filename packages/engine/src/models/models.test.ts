// WP-6 unit and integration tests: the router, adapters, limiter, decision models and settings run
// against the local mock provider server (no network, no real keys, no client content).
import { mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { ProviderError, createMemoryTransportPair, createRpcClient, type ModelsConfig, type Usage } from "@gw/shared";
import { createEngine } from "../engine";
import { createModelServices, type ModelServices } from ".";
import type { ProviderAdapter, ProviderRequest, ProviderResponse } from "./adapters/types";
import { SqliteCallLog } from "./call-log";
import { MemoryModelsStore, shippedModels } from "./config-store";
import { costUsd } from "./cost";
import { JevDecisionModel } from "./decision/jev";
import { toStrictJsonSchema } from "./json-schema";
import { MemoryKeyStore, openKeyStore } from "./keys";
import { ProviderLimiter } from "./limiter";
import { streamFailure } from "./adapters/openai";
import { ModelRouter, OutputError } from "./router";
import { startMockProviders, type MockProviders } from "./testing/mock-providers";
import fixture from "./decision/fixtures/systemone-response.json" with { type: "json" };
import { DatabaseSync } from "node:sqlite";

const KEY = "sk-test-SECRET-4f1c9a";

function pointAt(config: ModelsConfig, mock: MockProviders): ModelsConfig {
  const c = structuredClone(config);
  c.providers.anthropic!.base_url = mock.url;
  c.providers.openai!.base_url = `${mock.url}/v1`;
  c.providers.jev!.base_url = mock.url;
  c.providers.microsoft365!.base_url = `${mock.url}/beta`;
  return c;
}

function modelOf(config: ModelsConfig, provider: string, index = 0): string {
  const m = config.providers[provider]?.models?.[index];
  if (!m) throw new Error(`no model ${index} for ${provider}`);
  return m;
}

let mock: MockProviders;
let svc: ModelServices;
let appDir: string;

beforeEach(async () => {
  mock = await startMockProviders();
  appDir = mkdtempSync(path.join(tmpdir(), "gw-models-"));
  svc = createModelServices({ appDataDir: appDir, keyStore: "memory", graphToken: async () => "graph-token" });
  svc.store.set(pointAt(svc.store.get(), mock));
  for (const p of ["anthropic", "openai", "jev"]) await svc.keys.set(p, KEY);
});

afterEach(async () => {
  await mock.close();
});

describe("roles and models.json (§9.2)", () => {
  it("creates models.json from the shipped values and resolves each role through it", () => {
    const onDisk = JSON.parse(readFileSync(path.join(appDir, "models.json"), "utf8")) as ModelsConfig;
    expect(onDisk.roles.drafter.model).toBe(shippedModels().roles.drafter.model);
  });

  it("uses a role's new model on the next call with no restart, and the calls table records it (F-16 AC3)", async () => {
    const schema = z.object({ ok: z.boolean() });
    const first = await svc.llm.generate("worker", { stable: "", variable: "x" }, schema, { task: "test" });
    const cfg = svc.store.get();
    const other = modelOf(cfg, "anthropic", 0) === cfg.roles.worker.model ? modelOf(cfg, "anthropic", 1) : modelOf(cfg, "anthropic", 0);
    const next = structuredClone(cfg);
    next.roles.worker.model = other;
    svc.store.set(next);
    const second = await svc.llm.generate("worker", { stable: "", variable: "x" }, schema, { task: "test" });

    expect(first.model_id).toBe(cfg.roles.worker.model);
    expect(second.model_id).toBe(other);
    expect(mock.requests.map((r) => r.model)).toEqual([cfg.roles.worker.model, other]);
    expect(svc.log.summary().recent.map((c) => c.modelId)).toEqual([other, cfg.roles.worker.model]);
  });

  it("rereads models.json when it is edited on disk", async () => {
    const file = path.join(appDir, "models.json");
    const cfg = JSON.parse(readFileSync(file, "utf8")) as ModelsConfig;
    cfg.roles.extractor.max_output_tokens = 1234;
    writeFileSync(file, JSON.stringify(cfg));
    // Some file systems keep mtime resolution coarse; make the change visible.
    const t = statSync(file).mtimeMs + 2000;
    const { utimesSync } = await import("node:fs");
    utimesSync(file, t / 1000, t / 1000);
    expect(svc.store.get().roles.extractor.max_output_tokens).toBe(1234);
  });

  it("keeps the last good config when the file is edited into an invalid state", () => {
    const before = svc.store.get();
    const file = path.join(appDir, "models.json");
    writeFileSync(file, "{ not json");
    expect(svc.store.get()).toEqual(before);
  });
});

describe("Anthropic adapter", () => {
  it("sends the stored key, caches the stable prefix, costs the call from prices and logs no content", async () => {
    const schema = z.object({ answer: z.string(), score: z.number().min(0).max(1) });
    const stable = "RULES ".repeat(400);
    const a = await svc.llm.generate("drafter", { stable, variable: "Client passage text" }, schema, { task: "draft", runId: "R1" });
    const b = await svc.llm.generate("drafter", { stable, variable: "Another passage" }, schema, { task: "draft", runId: "R1" });

    expect(a.output).toEqual({ answer: "ok", score: 0.995 });
    expect(a.usage.cache_write).toBeGreaterThan(0);
    expect(b.usage.cache_read).toBe(a.usage.cache_write);
    const price = svc.store.get().prices[svc.store.get().roles.drafter.model]!;
    expect(a.cost_usd).toBeCloseTo(costUsd(price, a.usage), 10);
    expect(mock.requests[0]!.credential).toBe(KEY);
    const body = mock.requests[0]!.body as { output_config: { effort: string; format: { schema: Record<string, unknown> } } };
    expect(body.output_config.effort).toBe(svc.store.get().roles.drafter.effort);
    expect(body.output_config.format.schema.additionalProperties).toBe(false);

    const rows = svc.log.summary().recent;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ task: "draft", runId: "R1", role: "drafter", provider: "anthropic" });
    expect(rows[0]!.requestId).toMatch(/^req_mock_/);
    expect(JSON.stringify(rows)).not.toContain("passage");
  });

  it("maps a 401 to the auth error and never retries it", async () => {
    mock.failNext("/v1/messages", { status: 401, body: { type: "error", error: { type: "authentication_error", message: "bad key" } } });
    await expect(svc.llm.generate("chat", { stable: "", variable: "hi" })).rejects.toMatchObject({ kind: "auth" });
    expect(mock.requests).toHaveLength(1);
  });

  it("retries a 429 after its retry-after", async () => {
    mock.failNext("/v1/messages", { status: 429, headers: { "retry-after": "0" }, body: { type: "error", error: { type: "rate_limit_error", message: "slow" } } });
    const r = await svc.llm.generate("chat", { stable: "", variable: "hi" });
    expect(r.output).toBe("ok");
    expect(mock.requests).toHaveLength(2);
  });

  it("pauses on a spend cap (429 without retry-after) until the advisor resumes", async () => {
    const paused: string[] = [];
    const s = createModelServices({ keyStore: new MemoryKeyStore(), onPause: (p) => paused.push(p) });
    s.store.set(pointAt(s.store.get(), mock));
    await s.keys.set("anthropic", KEY);
    mock.failNext("/v1/messages", { status: 429, body: { type: "error", error: { type: "rate_limit_error", message: "cap" } } });
    const call = s.llm.generate("chat", { stable: "", variable: "hi" });
    await vitestWait(() => paused.length === 1);
    expect(s.llm.limiter("anthropic").paused).toBe(true);
    expect(mock.requests).toHaveLength(1);
    s.llm.resume("anthropic");
    await expect(call).resolves.toMatchObject({ output: "ok" });
    expect(paused).toEqual(["anthropic"]);
  });
});

describe("OpenAI adapter", () => {
  it("calls the Responses API statelessly with a strict schema, effort and a cache breakpoint", async () => {
    const cfg = structuredClone(svc.store.get());
    cfg.roles.drafter = { provider: "openai", model: modelOf(cfg, "openai"), effort: "high" };
    svc.store.set(cfg);
    const schema = z.object({ sentences: z.array(z.object({ text: z.string(), passage_ids: z.array(z.string()) })) });
    const stable = "RULES ".repeat(400);
    const a = await svc.llm.generate("drafter", { stable, variable: "v1" }, schema);
    const b = await svc.llm.generate("drafter", { stable, variable: "v2" }, schema);
    expect(a.output).toEqual({ sentences: [] });
    expect(a.usage.cache_write).toBeGreaterThan(0);
    expect(b.usage.cache_read).toBe(a.usage.cache_write);
    expect(b.usage.input).toBe(1);
    const body = mock.requests[0]!.body as Record<string, unknown>;
    expect(body.store).toBe(false);
    expect(body.prompt_cache_options).toEqual({ mode: "explicit" });
    expect(body.previous_response_id).toBeUndefined();
    expect(body.reasoning).toEqual({ effort: "high" });
    expect((body.text as { format: { strict: boolean } }).format.strict).toBe(true);
    expect(mock.requests[0]!.credential).toBe(KEY);
  });
});

describe("Microsoft 365 Copilot adapter", () => {
  it("can fill the chat role, turns web grounding off, and reports no usage", async () => {
    const cfg = structuredClone(svc.store.get());
    cfg.roles.chat = { ...cfg.roles.chat, provider: "microsoft365", model: modelOf(cfg, "microsoft365"), effort: undefined };
    svc.store.set(cfg);
    const r = await svc.llm.generate("chat", { stable: "Item context", variable: "Why is this weak?" });
    expect(r.output).toBe("ok");
    expect(r.cost_usd).toBe(0);
    const chat = mock.requests.find((q) => q.path.endsWith("/chat"))!;
    expect(chat.credential).toBe("graph-token");
    expect(chat.body.contextualResources).toEqual({ webContext: { isWebEnabled: false } });
  });

  it("is refused for roles that need structured output", async () => {
    const cfg = structuredClone(svc.store.get());
    cfg.roles.worker = { provider: "microsoft365", model: modelOf(cfg, "microsoft365") };
    svc.store.set(cfg);
    await expect(svc.llm.generate("worker", { stable: "", variable: "x" }, z.object({ a: z.string() }))).rejects.toMatchObject({
      kind: "invalid_request",
    });
    expect(mock.requests).toHaveLength(0);
  });
});

describe("structured output validation (§9.1)", () => {
  class ScriptedAdapter implements ProviderAdapter {
    readonly id = "anthropic";
    calls = 0;
    constructor(private readonly outputs: string[]) {}
    capabilities() {
      return { json_schema: true, prompt_cache: false, effort_levels: [], streaming: false, usage_reporting: true, max_context: 1000, max_output: 1000 };
    }
    async call(_req: ProviderRequest): Promise<ProviderResponse> {
      const text = this.outputs[this.calls++] ?? "";
      const usage: Usage = { input: 10, output: 5, cache_read: 0, cache_write: 0 };
      return { text, usage, modelId: "m", requestId: null, stopReason: "end" };
    }
  }
  const schema = z.object({ n: z.number().int() });
  const router = (outputs: string[]) => {
    const adapter = new ScriptedAdapter(outputs);
    const log = new SqliteCallLog(new DatabaseSync(":memory:"));
    return { adapter, log, llm: new ModelRouter({ store: new MemoryModelsStore(), adapters: [adapter], log }) };
  };

  it("retries once when the output fails the schema", async () => {
    const { adapter, log, llm } = router(['{"n":"x"}', '{"n":3}']);
    await expect(llm.generate("worker", { stable: "", variable: "" }, schema)).resolves.toMatchObject({ output: { n: 3 } });
    expect(adapter.calls).toBe(2);
    expect(log.summary().calls).toBe(2);
  });

  it("fails the step after a second bad output, naming paths but no values", async () => {
    const { llm } = router(['{"n":"secret client words"}', "not json"]);
    const err = await llm.generate("worker", { stable: "", variable: "" }, schema).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(OutputError);
    expect((err as Error).message).not.toContain("secret");
  });
});

describe("limiter (§7.8)", () => {
  it("never runs more than max_concurrency calls at once", async () => {
    const l = new ProviderLimiter({ maxConcurrency: 2 });
    let active = 0;
    let peak = 0;
    await Promise.all(
      Array.from({ length: 6 }, () =>
        l.schedule({
          prefixKey: null,
          run: async () => {
            peak = Math.max(peak, ++active);
            await new Promise((r) => setTimeout(r, 5));
            active--;
          },
        }),
      ),
    );
    expect(peak).toBe(2);
  });

  it("warms a shared prefix: one call goes first, the rest start after its first token", async () => {
    mock.firstByteDelayMs = 60;
    const stable = "SHARED PREFIX ".repeat(300);
    const results = await Promise.all(
      Array.from({ length: 4 }, (_, i) => svc.llm.generate("worker", { stable, variable: `field ${i}` }, z.object({ ok: z.boolean() }))),
    );
    const writes = results.filter((r) => r.usage.cache_write > 0);
    const reads = results.filter((r) => r.usage.cache_read > 0);
    expect(writes).toHaveLength(1);
    expect(reads).toHaveLength(3);
    const times = mock.requests.map((r) => r.at).sort((a, b) => a - b);
    expect(times[1]! - times[0]!).toBeGreaterThanOrEqual(50);
  });

  it("drops a queued call when its signal aborts, without leaking the slot", async () => {
    const l = new ProviderLimiter({ maxConcurrency: 1 });
    let release!: () => void;
    const first = l.schedule({ prefixKey: null, run: () => new Promise<void>((r) => (release = r)) });
    const ac = new AbortController();
    const queued = l.schedule({ prefixKey: null, signal: ac.signal, run: async () => "ran" });
    ac.abort(new Error("cancelled"));
    await expect(queued).rejects.toThrow("cancelled");
    release();
    await first;
    expect(l.active).toBe(0);
    await expect(l.schedule({ prefixKey: null, run: async () => "next" })).resolves.toBe("next");
  });

  it("hands the warm-up to a waiting call when the warming call fails", async () => {
    const l = new ProviderLimiter({ maxConcurrency: 4 });
    const order: string[] = [];
    const warmer = l.schedule({
      prefixKey: "p",
      run: async () => {
        order.push("warmer");
        await new Promise((r) => setTimeout(r, 10));
        throw new ProviderError("invalid_request", "bad");
      },
    });
    const waiter = l.schedule({
      prefixKey: "p",
      run: async (onFirstToken) => {
        order.push("waiter");
        onFirstToken();
        return "ok";
      },
    });
    await expect(warmer).rejects.toMatchObject({ kind: "invalid_request" });
    await expect(waiter).resolves.toBe("ok");
    expect(order).toEqual(["warmer", "waiter"]);
  });

  it("holds calls queued behind a spend cap instead of sending them", async () => {
    const l = new ProviderLimiter({ maxConcurrency: 1 });
    let sent = 0;
    let capped = false;
    const first = l.schedule({
      prefixKey: null,
      run: async () => {
        sent++;
        if (!capped) {
          capped = true;
          await new Promise((r) => setTimeout(r, 5));
          throw new ProviderError("spend_cap", "cap");
        }
        return "a";
      },
    });
    const second = l.schedule({ prefixKey: null, run: async () => (sent++, "b") });
    await vitestWait(() => l.paused);
    await new Promise((r) => setTimeout(r, 20));
    expect(sent).toBe(1);
    l.resume();
    await expect(Promise.all([first, second])).resolves.toEqual(["a", "b"]);
  });

  it("gives up after its retries on repeated overload", async () => {
    const l = new ProviderLimiter({ maxConcurrency: 1, maxRetries: 2, sleep: async () => {} });
    let n = 0;
    await expect(
      l.schedule({
        prefixKey: null,
        run: async () => {
          n++;
          throw new ProviderError("overloaded", "busy");
        },
      }),
    ).rejects.toMatchObject({ kind: "overloaded" });
    expect(n).toBe(3);
  });
});

describe("decision models (§8)", () => {
  const questions = [
    { id: "DG-4", kind: "probability" as const, statement_or_prompt: "The passage supports the row." },
    { id: "GAP", kind: "choice" as const, statement_or_prompt: "Why is it below threshold?", options: ["drafting", "evidence", "information", "other"] },
    { id: "MC-1a", kind: "score" as const, statement_or_prompt: "How strong is the answer?", rubric: ["Not addressed", "Weak", "Adequate", "Strong"] },
  ];

  const useJev = () => {
    const cfg = structuredClone(svc.store.get());
    cfg.roles.decider = { ...cfg.roles.decider, provider: "jev", model: modelOf(cfg, "jev"), effort: undefined };
    svc.store.set(cfg);
  };

  it("jev maps probability → noul (no confidence), choice → choice, score → score, in one request per state", async () => {
    useJev();
    const answers = await svc.decision.askMany("Shared state", questions, { task: "assess" });
    expect(mock.requests).toHaveLength(1);
    const body = mock.requests[0]!.body as { questions: Record<string, { type: string; criteria?: unknown }> };
    expect(Object.values(body.questions).map((q) => q.type)).toEqual(["noul", "choice", "score"]);
    expect(body.questions.q2!.criteria).toEqual(["Not addressed", "Weak", "Adequate", "Strong"]);
    expect(answers[0]).toMatchObject({ question_id: "DG-4", value: 0.97, confidence: null });
    expect(answers[1]).toMatchObject({ question_id: "GAP", value: "drafting", confidence: 0.85 });
    expect(answers[2]).toMatchObject({ question_id: "MC-1a", value: "3", confidence: 0.7 });
    expect(svc.log.summary().recent[0]).toMatchObject({ role: "decider", provider: "jev", task: "assess" });
  });

  it("jev parses the fixture response through the official SDK", async () => {
    const cfg = svc.store.get();
    const model = modelOf(cfg, "jev");
    const store = new MemoryModelsStore(
      (() => {
        const c = structuredClone(cfg);
        c.roles.decider = { ...c.roles.decider, provider: "jev", model };
        return c;
      })(),
    );
    const log = new SqliteCallLog(new DatabaseSync(":memory:"));
    const fakeFetch = (async () =>
      new Response(JSON.stringify({ ...fixture, model }), {
        status: 200,
        headers: { "content-type": "application/json", "x-typesafe-request-id": "req_fixture" },
      })) as typeof fetch;
    const jev = new JevDecisionModel({
      store,
      keys: async () => KEY,
      limiter: () => new ProviderLimiter({ maxConcurrency: 1 }),
      log,
      fetch: fakeFetch,
    });
    const answers = await jev.askMany("state", questions);
    expect(answers.map((a) => [a.value, a.confidence])).toEqual([
      [0.93, null],
      ["information", 0.62],
      ["3", 0.41],
    ]);
    expect(answers[2]!.distribution).toEqual({ "0": 0.02, "1": 0.13, "2": 0.33, "3": 0.52 });
    expect(log.summary().recent[0]).toMatchObject({ requestId: "req_fixture", tokensIn: 1812 });
    expect(log.summary().recent[0]!.costUsd).toBeCloseTo((1812 * cfg.prices[model]!.input_per_mtok) / 1e6, 12);
  });

  it("jev splits questions into several requests when one would pass the per-request limit", async () => {
    useJev();
    const cfg = structuredClone(svc.store.get());
    cfg.providers.jev!.request_limit_tokens = 1000;
    svc.store.set(cfg);
    const many = Array.from({ length: 8 }, (_, i) => ({
      id: `Q${i}`,
      kind: "probability" as const,
      statement_or_prompt: `Statement ${i} `.repeat(60),
    }));
    const answers = await svc.decision.askMany("state ".repeat(100), many);
    expect(answers.map((a) => a.question_id)).toEqual(many.map((q) => q.id));
    expect(mock.requests.length).toBeGreaterThan(1);
  });

  it("jev refuses a state over the decider's state limit instead of truncating it", async () => {
    useJev();
    await expect(svc.decision.askMany("x".repeat(200_000), questions)).rejects.toMatchObject({ kind: "invalid_request" });
    expect(mock.requests).toHaveLength(0);
  });

  it("the LLM stand-in answers the same questions with self-reported confidence", async () => {
    expect(svc.decision.implementation).toBe("llm");
    const answers = await svc.decision.askMany("Shared state", questions);
    expect(answers.map((a) => [a.value, a.confidence])).toEqual([
      [0.995, 0.995],
      ["drafting", 0.995],
      ["0", 0.995],
    ]);
    expect(mock.requests[0]!.path).toBe("/v1/messages");
    expect(svc.log.summary().recent[0]).toMatchObject({ role: "decider", provider: "anthropic" });
  });

  it("switching the decider between jev and the stand-in uses that model's own threshold (F-16 AC2)", () => {
    const cfg = structuredClone(svc.store.get());
    const jevModel = modelOf(cfg, "jev");
    cfg.decision_models = {
      ...cfg.decision_models,
      [jevModel]: { threshold: 0.95, thresholds: { choice: 0.9 }, state_limit_tokens: 32000 },
      [cfg.roles.decider.model]: { threshold: 0.8, state_limit_tokens: 100000 },
    };
    svc.store.set(cfg);
    expect(svc.decision.thresholds()).toEqual({ probability: 0.8, choice: 0.8, score: 0.8 });
    useJev();
    expect(svc.decision.implementation).toBe("jev");
    expect(svc.decision.thresholds()).toEqual({ probability: 0.95, choice: 0.9, score: 0.95 });
    expect(svc.decision.stateLimitTokens()).toBe(32000);
  });

});

describe("settings.* over RPC (F-16)", () => {
  const client = () => {
    const [ui, engine] = createMemoryTransportPair();
    createEngine({ appDataDir: appDir, keyStore: svc.keys }).attach(engine);
    return createRpcClient(ui, { timeoutMs: 5000 });
  };

  it("refuses a mapping that lacks what a role needs", async () => {
    const c = client();
    const cfg = await c.request("settings.getModels", {});
    const bad = structuredClone(cfg);
    bad.roles.drafter = { provider: "microsoft365", model: modelOf(cfg, "microsoft365") };
    await expect(c.request("settings.setModels", bad)).rejects.toMatchObject({ code: "invalid_params" });
    const badJev = structuredClone(cfg);
    badJev.roles.worker = { provider: "jev", model: modelOf(cfg, "jev") };
    await expect(c.request("settings.setModels", badJev)).rejects.toThrow(/only answers decision questions/);
  });

  it("tests a role through its current mapping and reports usage", async () => {
    const c = client();
    const r = await c.request("settings.testRole", { role: "extractor" });
    expect(r).toMatchObject({ ok: true, role: "extractor", provider: "anthropic" });
    const d = await c.request("settings.testRole", { role: "decider" });
    expect(d.ok).toBe(true);
    const u = await c.request("settings.usage", {});
    expect(u.calls).toBe(2);
    expect(u.byRole.extractor).toBeGreaterThan(0);
  });

  it("reports a missing key as an auth failure", async () => {
    await svc.keys.delete("anthropic");
    const r = await client().request("settings.testRole", { role: "worker" });
    expect(r).toMatchObject({ ok: false, error: { kind: "auth" } });
  });

  it("never writes a key to the app data folder (F-16 AC1)", async () => {
    const c = client();
    await c.request("settings.setKey", { provider: "anthropic", key: KEY });
    expect(await c.request("settings.hasKey", { provider: "anthropic" })).toEqual({ present: true });
    await c.request("settings.testRole", { role: "worker" });
    for (const file of walk(appDir)) {
      expect(readFileSync(file).includes(Buffer.from(KEY)), file).toBe(false);
    }
  });
});

describe("helpers", () => {
  it("strict JSON schema: closed objects, all properties required, no limits", () => {
    const s = toStrictJsonSchema(z.object({ a: z.string().max(5), b: z.number().min(0).optional(), c: z.array(z.string()).min(3) }));
    expect(s).toMatchObject({ type: "object", required: ["a", "b", "c"], additionalProperties: false });
    expect(JSON.stringify(s)).not.toMatch(/maxLength|minimum|"minItems":3/);
  });

  it("keeps schema fields whose names are JSON Schema keywords", () => {
    const s = toStrictJsonSchema(z.object({ format: z.string(), default: z.number(), pattern: z.object({ minimum: z.boolean() }) }));
    expect(Object.keys(s.properties as object)).toEqual(["format", "default", "pattern"]);
    expect(s.required).toEqual(["format", "default", "pattern"]);
    expect((s.properties as Record<string, { required: string[] }>).pattern!.required).toEqual(["minimum"]);
  });

  it("maps OpenAI in-stream failures by code, retrying only what can pass", () => {
    expect(streamFailure("insufficient_quota").kind).toBe("spend_cap");
    expect(streamFailure("rate_limit_exceeded").kind).toBe("rate_limited");
    expect(streamFailure("server_error").kind).toBe("overloaded");
    expect(streamFailure("invalid_prompt").kind).toBe("invalid_request");
  });

  it("costs long-context requests at the long-context rate", () => {
    const price = {
      input_per_mtok: 10,
      output_per_mtok: 50,
      cache_read_per_mtok: 1,
      cache_write_per_mtok: 12.5,
      long_context_over_tokens: 272_000,
      long_context_multiplier: 2,
      long_context_output_multiplier: 1.5,
    };
    expect(costUsd(price, { input: 100_000, output: 1000, cache_read: 0, cache_write: 0 })).toBeCloseTo(1.05, 8);
    expect(costUsd(price, { input: 300_000, output: 1000, cache_read: 0, cache_write: 0 })).toBeCloseTo(6.075, 8);
  });

  it("opens a key store in this process: the OS keyring when it works, memory otherwise", () => {
    expect(["credential-manager", "memory"]).toContain(openKeyStore().kind);
    expect(openKeyStore("memory").kind).toBe("memory");
  });
});

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)],
  );
}

async function vitestWait(cond: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error("condition not met");
    await new Promise((r) => setTimeout(r, 5));
  }
}
