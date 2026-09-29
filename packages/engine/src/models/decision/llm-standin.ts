// The LLM stand-in for the decision model (§8): whatever language model the `decider` role maps to
// answers the same typed questions with structured output, returning a value and a self-reported
// confidence. Used until jev credits exist, and for comparison afterwards. Its thresholds are its
// own (models.json decision_models), set by WP-11's calibration.
import { z } from "zod";
import type { Answer, AskOptions, DecisionModel, LanguageModel, Question, StatelessQuestion } from "@gw/shared";

const RULES = `You answer typed questions about the state below, exactly as a careful grant assessor would.
Judge only from the state. Do not assume facts it does not contain.
For each question:
- "probability": give p_yes, the probability from 0 to 1 that the statement is true of the state.
- "choice": give the one option that fits best.
- "score": give the rubric level that fits best (levels are numbered from 0, lowest first).
For every answer also give confidence, from 0 to 1: how likely your answer is correct.
Return one entry per question id.`;

const Unit = z.number().min(0).max(1);

function answerSchema(q: StatelessQuestion): z.ZodType {
  if (q.kind === "probability") return z.object({ p_yes: Unit, confidence: Unit });
  if (q.kind === "choice") return z.object({ choice: z.enum(q.options as [string, ...string[]]), confidence: Unit });
  const levels = q.rubric.map((_, i) => String(i));
  return z.object({ level: z.enum(levels as [string, ...string[]]), confidence: Unit });
}

function describe(q: StatelessQuestion, key: string): unknown {
  if (q.kind === "probability") return { id: key, kind: "probability", statement: q.statement_or_prompt };
  if (q.kind === "choice") return { id: key, kind: "choice", question: q.statement_or_prompt, options: q.options };
  return {
    id: key,
    kind: "score",
    question: q.statement_or_prompt,
    levels: q.rubric.map((text, i) => ({ level: String(i), text })),
  };
}

export class LlmDecisionModel implements DecisionModel {
  readonly #llm: LanguageModel;

  constructor(llm: LanguageModel) {
    this.#llm = llm;
  }

  async ask(question: Question, options: AskOptions = {}): Promise<Answer> {
    const { state, ...rest } = question;
    const [answer] = await this.askMany(state, [rest as StatelessQuestion], options);
    return answer!;
  }

  async askMany(state: string, questions: StatelessQuestion[], options: AskOptions = {}): Promise<Answer[]> {
    if (questions.length === 0) return [];
    const keys = questions.map((_, i) => `q${i}`);
    const schema = z.object(Object.fromEntries(questions.map((q, i) => [keys[i]!, answerSchema(q)])));
    const started = performance.now();
    const res = await this.#llm.generate(
      "decider",
      {
        // State first so every question set asked about the same state shares the cached prefix.
        stable: `${RULES}\n\n<state>\n${state}\n</state>`,
        variable: JSON.stringify({ questions: questions.map((q, i) => describe(q, keys[i]!)) }),
      },
      schema,
      { task: options.task ?? "decide", runId: options.runId ?? null, signal: options.signal },
    );
    const latency = Math.round(performance.now() - started);
    const out = res.output as Record<string, { p_yes?: number; choice?: string; level?: string; confidence: number }>;
    return questions.map((q, i) => {
      const a = out[keys[i]!]!;
      const base = {
        question_id: q.id,
        confidence: a.confidence,
        model_id: res.model_id,
        model_version: null,
        latency_ms: latency,
        cost_usd: res.cost_usd / questions.length,
      };
      if (q.kind === "probability") return { ...base, value: a.p_yes! };
      if (q.kind === "choice") return { ...base, value: a.choice! };
      return { ...base, value: a.level! };
    });
  }
}
