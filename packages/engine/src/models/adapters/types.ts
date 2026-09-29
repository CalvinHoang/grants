// What every language-model provider adapter implements (§9.1). The router above it resolves roles,
// validates output, computes cost and logs calls; an adapter only maps one request to its provider.
import type { Capabilities, Usage } from "@gw/shared";

export interface ProviderRequest {
  model: string;
  /** Only effort levels in the model's capabilities reach the adapter. */
  effort: string | undefined;
  /** Cacheable prefix (§7.3 ordering), sent byte-identical every time. */
  stable: string;
  variable: string;
  /** Strict JSON schema when the caller wants structured output and the model supports it. */
  jsonSchema: Record<string, unknown> | null;
  maxOutputTokens: number;
  signal?: AbortSignal;
  /** Called once when the first output arrives: the prompt cache for `stable` is readable from then on. */
  onFirstToken?: () => void;
}

export interface ProviderResponse {
  text: string;
  usage: Usage;
  modelId: string;
  requestId: string | null;
  /** Normalised: "end", "max_tokens", "refusal", or the provider's own value. */
  stopReason: string | null;
}

export interface ProviderAdapter {
  readonly id: string;
  /** Defaults for this provider; models.json `capabilities` corrects them per model. */
  capabilities(model: string): Capabilities;
  call(request: ProviderRequest): Promise<ProviderResponse>;
}

/** Reads a provider key when a call needs it, so a key saved in Settings works on the next call. */
export type KeyLookup = (provider: string) => Promise<string | null>;

export function retryAfterSeconds(headers: { get(name: string): string | null } | undefined): number | null {
  const ms = headers?.get("retry-after-ms");
  if (ms && Number.isFinite(Number(ms))) return Number(ms) / 1000;
  const v = headers?.get("retry-after");
  if (!v) return null;
  const n = Number(v);
  if (Number.isFinite(n)) return n;
  const date = Date.parse(v);
  return Number.isNaN(date) ? null : Math.max(0, (date - Date.now()) / 1000);
}
