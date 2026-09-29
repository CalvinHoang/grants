import { describe, expect, it } from "vitest";
import {
  Answer,
  DraftOutput,
  FieldId,
  FormField,
  meetsThreshold,
  resolveThresholds,
  ModelsConfig,
  ParagraphId,
  Question,
  RowId,
  methods,
  events,
} from "./index";

const answer = (value: number | string, confidence: number | null) =>
  Answer.parse({
    question_id: "q",
    value,
    confidence,
    model_id: "m",
    model_version: null,
    latency_ms: 1,
    cost_usd: 0,
  });

describe("ids", () => {
  it("accepts the formats used in the specs", () => {
    for (const id of ["AF-I.4", "AF-F.4b", "AF-D", "AF-G.12a", "AF-H.1o", "AF-M.2(4)", "AF-M.2(11)"]) expect(FieldId.parse(id)).toBe(id);
    for (const id of ["MC-4a.2", "EL-11.3", "EL-01", "ATT-01"]) expect(RowId.parse(id)).toBe(id);
    expect(ParagraphId.parse("D003-0142")).toBe("D003-0142");
    expect(() => ParagraphId.parse("D3-1")).toThrow();
  });
});

describe("decision model threshold rule (§8)", () => {
  const t = { probability: 0.99, choice: 0.99, score: 0.9 };
  it("uses value for probability questions", () => {
    expect(meetsThreshold("probability", answer(0.995, null), t)).toBe(true);
    expect(meetsThreshold("probability", answer(0.98, 1), t)).toBe(false);
  });
  it("uses confidence for choice and score questions", () => {
    expect(meetsThreshold("choice", answer("drafting", 0.995), t)).toBe(true);
    expect(meetsThreshold("choice", answer("drafting", null), t)).toBe(false);
    expect(meetsThreshold("score", answer("3", 0.91), t)).toBe(true);
  });
  it("accepts score answers between levels", () => {
    expect(answer(2.4, 0.95).value).toBe(2.4);
  });
  it("resolves per-kind thresholds from models.json", () => {
    expect(
      resolveThresholds({ provider: "d", model: "m", threshold: 0.99, thresholds: { score: 0.8 }, state_limit_tokens: 1 }),
    ).toEqual({ probability: 0.99, choice: 0.99, score: 0.8 });
  });
  it("requires options on choice questions", () => {
    expect(() => Question.parse({ id: "DG-1", kind: "choice", statement_or_prompt: "Which type?", state: "" })).toThrow();
  });
});

describe("models.json (§9.2)", () => {
  const cfg = {
    roles: {
      drafter: { provider: "a", model: "m1", effort: "high" },
      worker: { provider: "a", model: "m2", effort: "low" },
      extractor: { provider: "a", model: "m3" },
      decider: { provider: "d", model: "m4", threshold: 0.99, state_limit_tokens: 32000 },
      chat: { provider: "a", model: "m1", choices: ["m1", "m2"] },
    },
    providers: { a: { models: ["m1", "m2", "m3"] }, d: {} },
    prices: Object.fromEntries(
      ["m1", "m2", "m3", "m4"].map((m) => [
        m,
        {
          input_per_mtok: 1,
          output_per_mtok: 5,
          cache_read_per_mtok: 0.1,
          cache_write_per_mtok: 1.25,
          long_context_over_tokens: null,
          long_context_multiplier: null,
        },
      ]),
    ),
  };
  it("parses the documented shape", () => {
    expect(ModelsConfig.parse(cfg).roles.decider.threshold).toBe(0.99);
  });
  it("rejects a role whose provider is not configured", () => {
    const bad = structuredClone(cfg);
    bad.roles.worker.provider = "missing";
    expect(() => ModelsConfig.parse(bad)).toThrow(/missing/);
  });
  it("rejects a role model without a prices row, so every call can be costed", () => {
    const bad = structuredClone(cfg);
    bad.roles.worker.model = "m9";
    expect(() => ModelsConfig.parse(bad)).toThrow(/prices/);
  });
  it("rejects a chat choice no provider lists", () => {
    const bad = structuredClone(cfg);
    bad.roles.chat.choices = ["m1", "m4"];
    expect(() => ModelsConfig.parse(bad)).toThrow(/not listed/);
  });
  it("refuses credentials in provider settings", () => {
    const bad = structuredClone(cfg) as unknown as { providers: Record<string, Record<string, unknown>> };
    bad.providers.a = { api_key: "x", max_tokens: 100 };
    expect(() => ModelsConfig.parse(bad)).toThrow(/Credential Manager/);
    bad.providers.a = { models: ["m1", "m2", "m3"], max_tokens: 100 };
    expect(() => ModelsConfig.parse(bad)).not.toThrow();
  });
});

describe("drafting output (§7.3)", () => {
  it("requires row IDs on placeholders", () => {
    expect(() =>
      DraftOutput.parse({ sentences: [], placeholders: [{ row_ids: [], missing: "Target customers" }] }),
    ).toThrow();
  });
});

describe("form map (§5.1)", () => {
  it("parses a field entry", () => {
    const f = FormField.parse({
      id: "AF-I.4",
      label: "Impact of the grant",
      question: "Describe the impact",
      kind: "narrative",
      charLimit: 7000,
      anchor: { text: "Describe the impact", ordinal: 0 },
      rows: ["MC-4a.1"],
      sharedBoxGroup: "AF-I.4",
    });
    expect(f.kind).toBe("narrative");
  });
});

describe("contract (§4.2)", () => {
  it("covers every request namespace and event in the spec", () => {
    const namespaces = new Set(Object.keys(methods).map((m) => m.split(".")[0]));
    expect([...namespaces].sort()).toEqual(
      ["chat", "digest", "documents", "export", "field", "project", "run", "settings"].sort(),
    );
    expect(Object.keys(events).sort()).toEqual(
      ["digest.updated", "document.indexed", "error", "field.final", "flag.changed", "progress", "table.changed", "usage.updated"].sort(),
    );
  });
});
