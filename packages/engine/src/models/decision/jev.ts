// jev adapter (§8.1; docs/research/jev.md), built on the official SDK. Not yet run against the live
// API (no key): tested against a fixture shaped like the SDK's wire types. `probability` → Noul
// (P(yes), no confidence), `choice` → Choice, `score` → Score. askMany sends one request per shared
// state, splitting questions when a request would pass jev's per-request token limit.
import {
  APIConnectionError,
  APIError,
  APIUserAbortError,
  RateLimitError,
  TypeSafeClient,
  type Question as JevQuestion,
  type SystemOneResult,
} from "@typesafe-ai/sdk";
import { ProviderError, type Answer, type AskOptions, type DecisionModel, type Question, type StatelessQuestion } from "@gw/shared";
import type { KeyLookup } from "../adapters/types";
import { mapHttpFailure } from "../adapters/errors";
import type { CallLog } from "../call-log";
import { deciderSettings, type ModelsStore } from "../config-store";
import { costUsd, priceOf } from "../cost";
import type { ProviderLimiter } from "../limiter";
import { estimateTokens, questionText } from "./common";

export const JEV_PROVIDER = "jev";
/** Published per-request total (state counted once, plus every question). */
const DEFAULT_REQUEST_LIMIT_TOKENS = 64_000;

export interface JevOptions {
  store: ModelsStore;
  keys: KeyLookup;
  limiter: () => ProviderLimiter;
  log: CallLog;
  fetch?: typeof fetch;
  now?: () => number;
}


export class JevDecisionModel implements DecisionModel {
  readonly #o: JevOptions;

  constructor(options: JevOptions) {
    this.#o = options;
  }

  async ask(question: Question, ctx: AskOptions = {}): Promise<Answer> {
    const { state, ...rest } = question;
    const [answer] = await this.askMany(state, [rest as StatelessQuestion], ctx);
    return answer!;
  }

  async askMany(state: string, questions: StatelessQuestion[], ctx: AskOptions = {}): Promise<Answer[]> {
    if (questions.length === 0) return [];
    const config = this.#o.store.get();
    const model = config.roles.decider.model;
    const { stateLimitTokens } = deciderSettings(config);
    const providerCfg = config.providers[JEV_PROVIDER] ?? {};
    const requestLimit =
      typeof providerCfg.request_limit_tokens === "number" ? providerCfg.request_limit_tokens : DEFAULT_REQUEST_LIMIT_TOKENS;

    const stateTokens = estimateTokens(state);
    const qTokens = questions.map((q) => estimateTokens(questionText(q)));
    const longest = Math.max(...qTokens);
    if (stateTokens + longest > stateLimitTokens) {
      // The caller truncates state by the §7.5 order before asking; never cut the row wording here.
      throw new ProviderError("invalid_request", `jev: state plus longest question is over ${stateLimitTokens} tokens`);
    }

    // Pack questions into requests of at most requestLimit tokens (state counted once per request).
    const batches: number[][] = [];
    let current: number[] = [];
    let used = stateTokens;
    questions.forEach((_, i) => {
      if (current.length > 0 && used + qTokens[i]! > requestLimit) {
        batches.push(current);
        current = [];
        used = stateTokens;
      }
      current.push(i);
      used += qTokens[i]!;
    });
    batches.push(current);

    const answers: Answer[] = new Array(questions.length);
    await Promise.all(
      batches.map(async (idx) => {
        const res = await this.#request(model, state, idx.map((i) => questions[i]!), ctx);
        idx.forEach((qi, k) => (answers[qi] = res[k]!));
      }),
    );
    return answers;
  }

  async #request(model: string, state: string, questions: StatelessQuestion[], ctx: AskOptions): Promise<Answer[]> {
    const config = this.#o.store.get();
    const jevQuestions: Record<string, JevQuestion> = {};
    questions.forEach((q, i) => (jevQuestions[`q${i}`] = toJev(q)));

    const now = () => this.#o.now?.() ?? performance.now();
    const started = now();
    const { data, requestId } = await this.#o.limiter().schedule({
      prefixKey: null, // jev has no prompt cache
      signal: ctx.signal,
      run: async (onFirstToken) => {
        const apiKey = await this.#o.keys(JEV_PROVIDER);
        if (!apiKey) throw new ProviderError("auth", "jev: no key stored");
        const baseUrl = config.providers[JEV_PROVIDER]?.base_url;
        const client = new TypeSafeClient({
          apiKey,
          ...(baseUrl ? { baseURL: baseUrl } : {}),
          defaultModel: model,
          logLevel: "off", // debug logging would print request bodies (§10.3)
          retry: { maxRetries: 0 }, // the limiter owns retries
          timeout: 30_000,
          ...(this.#o.fetch ? { fetch: this.#o.fetch } : {}),
        });
        try {
          const r = await client.systemOne({ model, state, questions: jevQuestions }, { signal: ctx.signal }).withResponse();
          onFirstToken();
          return r;
        } catch (err) {
          throw toProviderError(err);
        }
      },
    });
    const latencyMs = Math.max(0, Math.round(now() - started));
    const result = data as SystemOneResult<Record<string, JevQuestion>>;
    const usage = { input: result.usage.input_tokens, output: result.usage.output_tokens, cache_read: 0, cache_write: 0 };
    const cost = costUsd(priceOf(config, model), usage);
    this.#o.log.record({
      runId: ctx.runId ?? null,
      task: ctx.task ?? "decide",
      role: "decider",
      provider: JEV_PROVIDER,
      modelId: model,
      tokensIn: usage.input,
      tokensOut: usage.output,
      tokensCacheRead: 0,
      tokensCacheWrite: 0,
      costUsd: cost,
      latencyMs,
      requestId: requestId ?? null,
      createdAt: new Date().toISOString(),
    });

    const perQuestionCost = cost / questions.length;
    return questions.map((q, i) => {
      const a = result.answers[`q${i}`];
      if (!a) throw new ProviderError("invalid_request", `jev: no answer for question ${i}`);
      const base = {
        question_id: q.id,
        model_id: model,
        model_version: result.model ?? null,
        latency_ms: latencyMs,
        cost_usd: perQuestionCost,
      };
      if (a.type === "noul") {
        return { ...base, value: clamp01(a.noul), confidence: null };
      }
      if (a.type === "choice") {
        return { ...base, value: String(a.choice), confidence: clamp01(a.confidence), distribution: clampAll(a.probabilities) };
      }
      // Score: the most probable level (the expected score can fall between levels).
      const probs = clampAll(a.probabilities as Record<string, number>);
      const level = Object.entries(probs).sort((x, y) => y[1] - x[1])[0]?.[0] ?? String(Math.round(a.score));
      return { ...base, value: level, confidence: clamp01(a.confidence), distribution: probs };
    });
  }
}

function toJev(q: StatelessQuestion): JevQuestion {
  if (q.kind === "probability") return { type: "noul", instructions: q.statement_or_prompt };
  if (q.kind === "choice") {
    return { type: "choice", instructions: q.statement_or_prompt, criteria: Object.fromEntries(q.options.map((o) => [o, null])) };
  }
  return { type: "score", instructions: q.statement_or_prompt, criteria: q.rubric as [string, string, ...string[]] };
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function clampAll(p: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(p).map(([k, v]) => [k, clamp01(v)]));
}

function toProviderError(err: unknown): unknown {
  if (err instanceof ProviderError || err instanceof APIUserAbortError) return err;
  if (err instanceof APIConnectionError) return new ProviderError("network", "jev: connection failed");
  if (err instanceof RateLimitError) {
    return new ProviderError("rate_limited", "jev 429", err.retryAfterMs !== undefined ? err.retryAfterMs / 1000 : null);
  }
  if (err instanceof APIError) {
    // Out-of-credit status is undocumented; 402 is the conventional one.
    if (err.status === 402) return new ProviderError("spend_cap", "jev 402: credit exhausted");
    return mapHttpFailure({ provider: "jev", status: err.status, headers: err.headers });
  }
  return err;
}
