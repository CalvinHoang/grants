// Anthropic Messages API adapter (§9.1; docs/research/llm.md §1). Streams every call so the limiter
// learns when the prompt cache becomes readable; structured output through output_config.format;
// cache_control on the stable prefix; effort through output_config.effort. No Batch API (not
// covered by zero retention) and no Citations (paragraph IDs replace them).
import Anthropic from "@anthropic-ai/sdk";
import { ProviderError, type Capabilities } from "@gw/shared";
import { mapHttpFailure } from "./errors";
import type { KeyLookup, ProviderAdapter, ProviderRequest, ProviderResponse } from "./types";

const EFFORT_LEVELS = ["low", "medium", "high", "xhigh", "max"] as const;
type Effort = (typeof EFFORT_LEVELS)[number];

export interface AnthropicOptions {
  keys: KeyLookup;
  baseUrl?: () => string | undefined;
  fetch?: typeof fetch;
}

export class AnthropicAdapter implements ProviderAdapter {
  readonly id = "anthropic";
  readonly #opts: AnthropicOptions;

  constructor(opts: AnthropicOptions) {
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
    if (!apiKey) throw new ProviderError("auth", "anthropic: no key stored");
    const client = new Anthropic({
      apiKey,
      baseURL: this.#opts.baseUrl?.(),
      maxRetries: 0, // the limiter owns retries
      fetch: this.#opts.fetch,
    });

    const content: Anthropic.TextBlockParam[] = [];
    if (req.stable) content.push({ type: "text", text: req.stable, cache_control: { type: "ephemeral" } });
    if (req.variable) content.push({ type: "text", text: req.variable });
    if (content.length === 0) throw new ProviderError("invalid_request", "anthropic: empty prompt");

    const outputConfig: Anthropic.OutputConfig = {};
    if (req.effort) outputConfig.effort = req.effort as Effort;
    if (req.jsonSchema) outputConfig.format = { type: "json_schema", schema: req.jsonSchema };

    let first = false;
    try {
      const stream = client.messages.stream(
        {
          model: req.model,
          max_tokens: req.maxOutputTokens,
          messages: [{ role: "user", content }],
          ...(Object.keys(outputConfig).length ? { output_config: outputConfig } : {}),
        },
        { signal: req.signal },
      );
      stream.on("streamEvent", () => {
        if (!first) {
          first = true;
          req.onFirstToken?.();
        }
      });
      const message = await stream.finalMessage();
      const text = message.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");
      return {
        text,
        usage: {
          input: message.usage.input_tokens,
          output: message.usage.output_tokens,
          cache_read: message.usage.cache_read_input_tokens ?? 0,
          cache_write: message.usage.cache_creation_input_tokens ?? 0,
        },
        modelId: message.model,
        requestId: stream.request_id ?? null,
        stopReason: normaliseStop(message.stop_reason),
      };
    } catch (err) {
      throw toProviderError(err);
    }
  }
}

function normaliseStop(reason: string | null): string | null {
  if (reason === "end_turn" || reason === "stop_sequence") return "end";
  return reason;
}

function toProviderError(err: unknown): unknown {
  if (err instanceof ProviderError) return err;
  if (err instanceof Anthropic.APIUserAbortError) return err;
  if (err instanceof Anthropic.APIConnectionError) return new ProviderError("network", "anthropic: connection failed");
  if (err instanceof Anthropic.APIError) {
    return mapHttpFailure({
      provider: "anthropic",
      status: err.status,
      type: err.type,
      headers: err.headers,
      spendCapWithoutRetryAfter: true,
    });
  }
  return err;
}
