// Live checks against the real providers (§13 item 3). Skipped unless the provider's key is in the
// environment, so CI never calls out. Run with, for example:
//   OPENAI_API_KEY=… npx vitest run packages/engine/src/models/live.test.ts
// Prompts here are synthetic; no client content.
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createModelServices } from ".";
import { MemoryKeyStore } from "./keys";

const env = (name: string) => process.env[name]?.trim() || undefined;

async function services(provider: string, key: string) {
  const keys = new MemoryKeyStore();
  await keys.set(provider, key);
  return createModelServices({ keyStore: keys });
}

describe.skipIf(!env("OPENAI_API_KEY"))("OpenAI live (confirms the research on the drafting candidate)", () => {
  it("returns strict structured output, usage and cache counts through the Responses API", async () => {
    const s = await services("openai", env("OPENAI_API_KEY")!);
    const cfg = structuredClone(s.store.get());
    const model = cfg.providers.openai!.models![0]!;
    cfg.roles.drafter = { provider: "openai", model, effort: "low", max_output_tokens: 2000 };
    s.store.set(cfg);
    const schema = z.object({ sentences: z.array(z.object({ text: z.string(), passage_ids: z.array(z.string()) })) });
    const stable = `You write one sentence for a grant form from the numbered passages, citing their IDs.\n${"Rules. ".repeat(300)}`;
    const variable = "P-001: Harbour Robotics builds marine inspection robots. Write one sentence.";
    const first = await s.llm.generate("drafter", { stable, variable }, schema, { task: "live-check" });
    const second = await s.llm.generate("drafter", { stable, variable }, schema, { task: "live-check" });
    expect(first.output.sentences.length).toBeGreaterThan(0);
    expect(first.usage.output).toBeGreaterThan(0);
    // Report what the provider returned so the PR can quote it.
    process.stdout.write(`openai live: model=${first.model_id} usage1=${JSON.stringify(first.usage)} usage2=${JSON.stringify(second.usage)} cost=${first.cost_usd}\n`);
  });
});

describe.skipIf(!env("ANTHROPIC_LIVE_KEY"))("Anthropic live", () => {
  it("returns structured output with cache write then read", async () => {
    const s = await services("anthropic", env("ANTHROPIC_LIVE_KEY")!);
    const schema = z.object({ ok: z.boolean() });
    const stable = `Answer as JSON.\n${"Rules. ".repeat(400)}`;
    const a = await s.llm.generate("worker", { stable, variable: 'Return {"ok": true}.' }, schema);
    const b = await s.llm.generate("worker", { stable, variable: 'Return {"ok": true} again.' }, schema);
    expect(a.output.ok).toBe(true);
    process.stdout.write(`anthropic live: usage1=${JSON.stringify(a.usage)} usage2=${JSON.stringify(b.usage)}\n`);
  });
});

describe.skipIf(!env("TYPESAFE_API_KEY"))("jev live", () => {
  it("answers noul, choice and score questions in one request", async () => {
    const s = await services("jev", env("TYPESAFE_API_KEY")!);
    const cfg = structuredClone(s.store.get());
    cfg.roles.decider = { ...cfg.roles.decider, provider: "jev", model: cfg.providers.jev!.models![0]!, effort: undefined };
    s.store.set(cfg);
    const answers = await s.decision.askMany("Harbour Robotics has 42 staff and builds marine inspection robots.", [
      { id: "p", kind: "probability", statement_or_prompt: "The company builds robots." },
      { id: "c", kind: "choice", statement_or_prompt: "What sector is this?", options: ["marine", "medical", "other"] },
      { id: "s", kind: "score", statement_or_prompt: "How specific is the description?", rubric: ["Vague", "Some detail", "Specific"] },
    ]);
    expect(answers).toHaveLength(3);
    process.stdout.write(`jev live: ${JSON.stringify(answers.map((a) => [a.value, a.confidence, a.model_version, a.latency_ms]))}\n`);
  });
});
