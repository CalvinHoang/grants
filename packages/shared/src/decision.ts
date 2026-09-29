// Decision-model contract (build spec §8). jev and the LLM stand-in both implement `DecisionModel`.
import { z } from "zod";
import { QuestionId } from "./ids";
import type { DeciderRoleConfig, Thresholds } from "./models";

export const QuestionKind = z.enum(["probability", "choice", "score"]);
export type QuestionKind = z.infer<typeof QuestionKind>;

const QuestionBase = z.object({
  id: QuestionId,
  /** Statement for probability questions ("This passage provides evidence for…"), prompt otherwise. */
  statement_or_prompt: z.string().min(1),
  state: z.string(),
});

export const Question = z.discriminatedUnion("kind", [
  QuestionBase.extend({ kind: z.literal("probability") }),
  QuestionBase.extend({
    kind: z.literal("choice"),
    options: z.array(z.string().min(1)).min(2).max(255),
  }),
  QuestionBase.extend({
    kind: z.literal("score"),
    /** Ordered level descriptions, lowest first (jev `criteria`). */
    rubric: z.array(z.string().min(1)).min(2),
  }),
]);
export type Question = z.infer<typeof Question>;

/** A question asked against a state supplied once for many questions (askMany). */
export const StatelessQuestion = z.discriminatedUnion("kind", [
  Question.options[0].omit({ state: true }),
  Question.options[1].omit({ state: true }),
  Question.options[2].omit({ state: true }),
]);
export type StatelessQuestion = z.infer<typeof StatelessQuestion>;

export const Answer = z.object({
  question_id: QuestionId,
  /**
   * P(yes) (0–1) for probability, the chosen option for choice, and for score the expected
   * level (0-based, may fall between levels) or the level's name.
   */
  value: z.union([z.number().min(0), z.string()]),
  /** Null where the implementation reports none (jev probability questions). */
  confidence: z.number().min(0).max(1).nullable(),
  distribution: z.record(z.string(), z.number().min(0).max(1)).optional(),
  model_id: z.string().min(1),
  model_version: z.string().nullable(),
  latency_ms: z.number().int().min(0),
  cost_usd: z.number().min(0),
});
export type Answer = z.infer<typeof Answer>;

export interface AskOptions {
  /** Workflow task recorded in the calls table, e.g. "assess", "digest.confirm". */
  task?: string;
  runId?: string | null;
  signal?: AbortSignal;
}

export interface DecisionModel {
  ask(question: Question, options?: AskOptions): Promise<Answer>;
  /** Many questions against one shared state (one jev request per state). */
  askMany(state: string, questions: StatelessQuestion[], options?: AskOptions): Promise<Answer[]>;
}

/**
 * The threshold rule (§8): probability questions compare `value` (P(yes)); choice and score
 * questions compare `confidence`. A missing confidence never passes.
 */
export function meetsThreshold(kind: QuestionKind, answer: Answer, thresholds: Thresholds): boolean {
  const limit = thresholds[kind];
  if (kind === "probability") {
    return typeof answer.value === "number" && answer.value <= 1 && answer.value >= limit;
  }
  return answer.confidence !== null && answer.confidence >= limit;
}

/** Full thresholds for the decider: per-kind overrides from models.json, else its single threshold. */
export function resolveThresholds(decider: DeciderRoleConfig): Thresholds {
  return {
    probability: decider.thresholds?.probability ?? decider.threshold,
    choice: decider.thresholds?.choice ?? decider.threshold,
    score: decider.thresholds?.score ?? decider.threshold,
  };
}
