// Helpers shared by the decision-model implementations (§8).
import type { StatelessQuestion } from "@gw/shared";

/** Rough token count for budgeting before a call (≈3.5 characters per token for English; errs high). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

export function questionText(q: StatelessQuestion): string {
  if (q.kind === "choice") return `${q.statement_or_prompt}\n${q.options.join("\n")}`;
  if (q.kind === "score") return `${q.statement_or_prompt}\n${q.rubric.join("\n")}`;
  return q.statement_or_prompt;
}
