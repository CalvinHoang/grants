// Language-model contract (build spec §9.1). Adapters (WP-6) implement `LanguageModel`;
// the workflow calls `generate` with a role, never a model.
import { z } from "zod";
import type { ModelRole } from "./models";

export const Usage = z.object({
  input: z.number().int().min(0),
  output: z.number().int().min(0),
  cache_read: z.number().int().min(0),
  cache_write: z.number().int().min(0),
});
export type Usage = z.infer<typeof Usage>;

/** The prompt, split so the stable prefix can be cached (§7.3 ordering). */
export const GenerateInput = z.object({
  stable: z.string(),
  variable: z.string(),
});
export type GenerateInput = z.infer<typeof GenerateInput>;

export const GenerateResult = z.object({
  /** Parsed JSON when a schema was given (already validated), otherwise text. */
  output: z.unknown(),
  usage: Usage,
  cost_usd: z.number().min(0),
  model_id: z.string().min(1),
  request_id: z.string().nullable(),
  stop_reason: z.string().nullable(),
});
export type GenerateResult = z.infer<typeof GenerateResult>;

export const Capabilities = z.object({
  json_schema: z.boolean(),
  prompt_cache: z.boolean(),
  effort_levels: z.array(z.string()),
  streaming: z.boolean(),
  usage_reporting: z.boolean(),
  max_context: z.number().int().positive(),
  /** Largest output one call may ask for. */
  max_output: z.number().int().positive(),
});
export type Capabilities = z.infer<typeof Capabilities>;

/** Capabilities each role needs before Settings accepts a mapping (§9.1). */
export const REQUIRED_CAPABILITIES: Record<ModelRole, readonly BooleanCapability[]> = {
  drafter: ["json_schema", "usage_reporting"],
  worker: ["json_schema", "usage_reporting"],
  extractor: ["json_schema", "usage_reporting"],
  /** When the decider is the LLM stand-in; jev is checked by its own adapter. */
  decider: ["json_schema", "usage_reporting"],
  chat: [],
};
export type BooleanCapability = "json_schema" | "prompt_cache" | "streaming" | "usage_reporting";

/** Names the capabilities a role needs that a model lacks; empty when the mapping is allowed. */
export function missingCapabilities(role: ModelRole, caps: Capabilities): BooleanCapability[] {
  return REQUIRED_CAPABILITIES[role].filter((c) => !caps[c]);
}

/** Every provider error maps to one of these (§9.1). */
export const ProviderErrorKind = z.enum([
  "rate_limited",
  "spend_cap",
  "overloaded",
  "invalid_request",
  "auth",
  "network",
]);
export type ProviderErrorKind = z.infer<typeof ProviderErrorKind>;

export class ProviderError extends Error {
  readonly kind: ProviderErrorKind;
  /** Seconds to wait, from the provider's retry-after, when kind is rate_limited. */
  readonly retryAfter: number | null;

  constructor(kind: ProviderErrorKind, message: string, retryAfter: number | null = null) {
    super(message);
    this.name = "ProviderError";
    this.kind = kind;
    this.retryAfter = retryAfter;
  }
}

/**
 * The language-model interface. `schema` is a zod schema; the adapter asks the provider for
 * structured output where the provider supports it and always validates the result in code,
 * retrying once (§9.1).
 */
export interface GenerateOptions {
  /** Workflow task recorded in the calls table, e.g. "draft", "review", "digest.candidates". */
  task?: string;
  runId?: string | null;
  /** Chat only: one of the chat role's `choices` (the chat-box selector). */
  model?: string;
  signal?: AbortSignal;
}

export interface LanguageModel {
  generate<T = unknown>(
    role: ModelRole,
    input: GenerateInput,
    schema?: z.ZodType<T>,
    options?: GenerateOptions,
  ): Promise<Omit<GenerateResult, "output"> & { output: T }>;
  capabilities(provider: string, model: string): Promise<Capabilities>;
}
