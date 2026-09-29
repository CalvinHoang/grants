// OpenAI Responses API adapter (§9.1; docs/research/llm.md §2). Stateless under zero retention:
// `store:false`, full input every call, never `previous_response_id`. Strict JSON schema output,
// reasoning effort, an explicit prompt-cache breakpoint after the stable prefix.
//
// The OpenAI flagship-model details behind this adapter come from search snippets and third parties
// (OpenAI's own docs were blocked during research); live.test.ts confirms them with a
// live call once a key is available.
import OpenAI from "openai";
import { ProviderError, type Capabilities } from "@gw/shared";
import { mapHttpFailure } from "./errors";
import type { KeyLookup, ProviderAdapter, ProviderRequest, ProviderResponse } from "./types";

const EFFORT_LEVELS = ["low", "medium", "high", "xhigh", "max"] as const;
type Effort = (typeof EFFORT_LEVELS)[number];

export interface OpenAiOptions {
  keys: KeyLookup;
  baseUrl?: () => string | undefined;
  fetch?: typeof fetch;
}

export class OpenAiAdapter implements ProviderAdapter {
  readonly id = "openai";
  readonly #opts: OpenAiOptions;

  constructor(opts: OpenAiOptions) {
    this.#opts = opts;
  }

  capabilities(): Capabilities {
    return {
      json_schema: true,
      prompt_cache: true,
      effort_levels: [...EFFORT_LEVELS],
      streaming: true,
      usage_reporting: true,
      max_context: 1_000_000,
      max_output: 128_000,
    };
  }

  async call(req: ProviderRequest): Promise<ProviderResponse> {
    const apiKey = await this.#opts.keys(this.id);
    if (!apiKey) throw new ProviderError("auth", "openai: no key stored");
    const client = new OpenAI({ apiKey, baseURL: this.#opts.baseUrl?.(), maxRetries: 0, fetch: this.#opts.fetch });

    const content: OpenAI.Responses.ResponseInputText[] = [];
    if (req.stable) {
      content.push({ type: "input_text", text: req.stable, prompt_cache_breakpoint: { mode: "explicit" } });
    }
    if (req.variable) content.push({ type: "input_text", text: req.variable });
    if (content.length === 0) throw new ProviderError("invalid_request", "openai: empty prompt");

    let first = false;
    try {
      const { data: stream, request_id } = await client.responses
        .create(
          {
            model: req.model,
            store: false,
            stream: true,
            input: [{ role: "user", content }],
            max_output_tokens: req.maxOutputTokens,
            // Explicit mode: only the breakpoint after `stable` is written, not an implicit one at the
            // end of the prompt (cache writes are billed on this provider).
            ...(req.stable ? { prompt_cache_options: { mode: "explicit" as const } } : {}),
            ...(req.effort ? { reasoning: { effort: req.effort as Effort } } : {}),
            ...(req.jsonSchema
              ? { text: { format: { type: "json_schema", name: "output", strict: true, schema: req.jsonSchema } } }
              : {}),
          },
          { signal: req.signal },
        )
        .withResponse();

      let final: OpenAI.Responses.Response | null = null;
      for await (const event of stream) {
        if (!first) {
          first = true;
          req.onFirstToken?.();
        }
        if (event.type === "response.completed" || event.type === "response.incomplete") final = event.response;
        if (event.type === "response.failed") throw streamFailure(event.response.error?.code ?? null);
        if (event.type === "error") throw streamFailure(event.code ?? null);
      }
      if (!final) throw new ProviderError("network", "openai: stream ended without a response");
      return toResponse(final, request_id);
    } catch (err) {
      throw toProviderError(err);
    }
  }
}

function toResponse(r: OpenAI.Responses.Response, requestId: string | null): ProviderResponse {
  let text = "";
  let refused = false;
  for (const item of r.output) {
    if (item.type !== "message") continue;
    for (const part of item.content) {
      if (part.type === "output_text") text += part.text;
      if (part.type === "refusal") refused = true;
    }
  }
  const u = r.usage;
  const cacheRead = u?.input_tokens_details?.cached_tokens ?? 0;
  const cacheWrite = u?.input_tokens_details?.cache_write_tokens ?? 0;
  const stop = refused
    ? "refusal"
    : r.status === "incomplete"
      ? r.incomplete_details?.reason === "max_output_tokens"
        ? "max_tokens"
        : (r.incomplete_details?.reason ?? "incomplete")
      : "end";
  return {
    text,
    usage: {
      // input_tokens includes cached and cache-written tokens; bill each once.
      input: Math.max(0, (u?.input_tokens ?? 0) - cacheRead - cacheWrite),
      output: u?.output_tokens ?? 0,
      cache_read: cacheRead,
      cache_write: cacheWrite,
    },
    modelId: r.model,
    requestId,
    stopReason: stop,
  };
}

/** A failure reported inside the stream (HTTP 200): map by its error code, retrying only what can pass. */
export function streamFailure(code: string | null): ProviderError {
  const label = `openai stream ${code ?? "error"}`;
  if (code === "insufficient_quota") return new ProviderError("spend_cap", label);
  if (code === "rate_limit_exceeded" || code === "rate_limit_error") return new ProviderError("rate_limited", label);
  if (code === "server_error" || code === "overloaded" || code === "service_unavailable") return new ProviderError("overloaded", label);
  return new ProviderError("invalid_request", label);
}

function toProviderError(err: unknown): unknown {
  if (err instanceof ProviderError) return err;
  if (err instanceof OpenAI.APIUserAbortError) return err;
  if (err instanceof OpenAI.APIConnectionError) return new ProviderError("network", "openai: connection failed");
  if (err instanceof OpenAI.APIError) {
    return mapHttpFailure({
      provider: "openai",
      status: err.status,
      type: err.code ?? err.type ?? null,
      headers: err.headers,
      quotaExhausted: err.code === "insufficient_quota",
    });
  }
  return err;
}
