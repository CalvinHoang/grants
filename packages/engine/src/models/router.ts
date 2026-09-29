// The engine's LanguageModel (§9.1): resolves a role through models.json at call time, checks the
// model's capabilities, sends the call through the provider's limiter, validates structured output
// against the caller's zod schema (one retry), computes cost from `prices` and logs the call.
import { createHash } from "node:crypto";
import type { z } from "zod";
import {
  ProviderError,
  missingCapabilities,
  type Capabilities,
  type GenerateInput,
  type GenerateOptions,
  type GenerateResult,
  type LanguageModel,
  type ModelRole,
  type ModelsConfig,
} from "@gw/shared";
import type { ProviderAdapter } from "./adapters/types";
import type { CallLog } from "./call-log";
import { resolveRole, type ModelsStore, type ResolvedRole } from "./config-store";
import { costUsd, priceOf } from "./cost";
import { toStrictJsonSchema } from "./json-schema";
import { ProviderLimiter } from "./limiter";

/** Structured output failed validation twice, or the model refused: the step is failed(retryable) (§9.1). */
export class OutputError extends Error {
  readonly kind = "invalid_output" as const;
  constructor(message: string) {
    super(message);
    this.name = "OutputError";
  }
}

export interface RouterOptions {
  store: ModelsStore;
  adapters: ProviderAdapter[];
  log: CallLog;
  /** A provider hit its spend cap; its calls are held until `resume(provider)`. */
  onPause?: (provider: string) => void;
  now?: () => number;
}

const DEFAULT_MAX_OUTPUT = 8000;

export class ModelRouter implements LanguageModel {
  readonly #o: RouterOptions;
  readonly #adapters = new Map<string, ProviderAdapter>();
  readonly #limiters = new Map<string, ProviderLimiter>();

  constructor(options: RouterOptions) {
    this.#o = options;
    for (const a of options.adapters) this.#adapters.set(a.id, a);
  }

  get providers(): string[] {
    return [...this.#adapters.keys()];
  }

  adapter(provider: string): ProviderAdapter | undefined {
    return this.#adapters.get(provider);
  }

  /** The adapter's defaults with models.json per-model corrections applied. */
  async capabilities(provider: string, model: string): Promise<Capabilities> {
    return capabilitiesOf(this.#o.store.get(), this.#requireAdapter(provider), model);
  }

  limiter(provider: string): ProviderLimiter {
    let l = this.#limiters.get(provider);
    const max = this.#o.store.get().providers[provider]?.max_concurrency ?? 4;
    if (!l) {
      l = new ProviderLimiter({ maxConcurrency: max, onPause: () => this.#o.onPause?.(provider) });
      this.#limiters.set(provider, l);
    } else {
      l.setMaxConcurrency(max);
    }
    return l;
  }

  resume(provider: string): void {
    this.#limiters.get(provider)?.resume();
  }

  async generate<T = unknown>(
    role: ModelRole,
    input: GenerateInput,
    schema?: z.ZodType<T>,
    options: GenerateOptions = {},
  ): Promise<Omit<GenerateResult, "output"> & { output: T }> {
    const config = this.#o.store.get();
    const r = resolveRole(config, role, options.model);
    const adapter = this.#requireAdapter(r.provider);
    const caps = capabilitiesOf(config, adapter, r.model);
    const missing = missingCapabilities(role, caps);
    if (missing.length > 0) {
      throw new ProviderError("invalid_request", `${r.provider} ${r.model} lacks ${missing.join(", ")} needed by ${role}`);
    }
    if (schema && !caps.json_schema) {
      throw new ProviderError("invalid_request", `${r.provider} ${r.model} can't return structured output`);
    }
    const price = priceOf(config, r.model); // before any billed call, so every call can be costed and logged
    const jsonSchema = schema ? toStrictJsonSchema(schema) : null;
    const effort = r.effort && caps.effort_levels.includes(r.effort) ? r.effort : undefined;
    const maxOutputTokens = Math.min(r.maxOutputTokens ?? DEFAULT_MAX_OUTPUT, caps.max_output);
    const prefixKey =
      caps.prompt_cache && input.stable
        ? `${r.model}|${effort ?? ""}|${jsonSchema ? hash(JSON.stringify(jsonSchema)) : ""}|${hash(input.stable)}`
        : null;

    let lastProblem = "";
    for (let attempt = 0; attempt < 2; attempt++) {
      const started = this.#now();
      const res = await this.limiter(r.provider).schedule({
        prefixKey,
        signal: options.signal,
        run: (onFirstToken) =>
          adapter.call({
            model: r.model,
            effort,
            stable: input.stable,
            variable: input.variable,
            jsonSchema,
            maxOutputTokens,
            signal: options.signal,
            onFirstToken,
          }),
      });
      const latencyMs = Math.max(0, Math.round(this.#now() - started));
      const cost = costUsd(price, res.usage);
      this.#log(r, options, res.usage, cost, latencyMs, res.requestId);

      const checked = check(res.text, res.stopReason, schema);
      if (checked.ok) {
        return {
          output: checked.value as T,
          usage: res.usage,
          cost_usd: cost,
          model_id: res.modelId,
          request_id: res.requestId,
          stop_reason: res.stopReason,
        };
      }
      lastProblem = checked.problem;
    }
    throw new OutputError(`${r.provider} ${r.model}: ${lastProblem} after one retry`);
  }

  #log(
    r: ResolvedRole,
    o: GenerateOptions,
    usage: GenerateResult["usage"],
    cost: number,
    latencyMs: number,
    requestId: string | null,
  ): void {
    this.#o.log.record({
      runId: o.runId ?? null,
      task: o.task ?? r.role,
      role: r.role,
      provider: r.provider,
      // The configured ID (what Settings shows); the provider may report a dated snapshot instead.
      modelId: r.model,
      tokensIn: usage.input,
      tokensOut: usage.output,
      tokensCacheRead: usage.cache_read,
      tokensCacheWrite: usage.cache_write,
      costUsd: cost,
      latencyMs,
      requestId,
      createdAt: new Date(this.#o.now?.() ?? Date.now()).toISOString(),
    });
  }

  #requireAdapter(provider: string): ProviderAdapter {
    const a = this.#adapters.get(provider);
    if (!a) throw new ProviderError("invalid_request", `no adapter for provider "${provider}"`);
    return a;
  }

  #now(): number {
    return this.#o.now?.() ?? performance.now();
  }
}

export function capabilitiesOf(config: ModelsConfig, adapter: ProviderAdapter, model: string): Capabilities {
  const base = adapter.capabilities(model);
  const o = config.capabilities?.[model] ?? {};
  return {
    json_schema: o.json_schema ?? base.json_schema,
    prompt_cache: o.prompt_cache ?? base.prompt_cache,
    effort_levels: o.effort_levels ?? base.effort_levels,
    streaming: o.streaming ?? base.streaming,
    usage_reporting: o.usage_reporting ?? base.usage_reporting,
    max_context: o.max_context ?? base.max_context,
    max_output: o.max_output ?? base.max_output,
  };
}

function check(
  text: string,
  stop: string | null,
  schema: z.ZodType | undefined,
): { ok: true; value: unknown } | { ok: false; problem: string } {
  if (stop === "refusal") return { ok: false, problem: "refused" };
  if (!schema) {
    return stop === "max_tokens" && !text ? { ok: false, problem: "empty output at max_tokens" } : { ok: true, value: text };
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, problem: stop === "max_tokens" ? "output cut off at max_tokens" : "output is not JSON" };
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    // Paths only: the values may be client content.
    return { ok: false, problem: `output fails schema at ${parsed.error.issues.map((i) => i.path.join(".") || "(root)").join(", ")}` };
  }
  return { ok: true, value: parsed.data };
}

function hash(s: string): string {
  return createHash("sha256").update(s).digest("hex").slice(0, 16);
}
