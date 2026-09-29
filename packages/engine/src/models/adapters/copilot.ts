// Microsoft 365 Copilot Chat API adapter (§9.1; docs/research/llm.md §3). Just another provider in
// models.json. Its capabilities today (text only, no token usage, no model choice) let it fill the
// `chat` role only; the capability check opens other roles if Microsoft adds structured output.
//
// Preview Graph endpoint (/beta), from Microsoft Learn pages read during research; not yet called
// live. Needs a Microsoft 365 Copilot licence and delegated Graph scopes beyond the SharePoint link,
// requested at first use by the Microsoft sign-in (WP-5), which supplies `token`.
import { ProviderError, type Capabilities } from "@gw/shared";
import { mapHttpFailure } from "./errors";
import type { ProviderAdapter, ProviderRequest, ProviderResponse } from "./types";

const GRAPH = "https://graph.microsoft.com/beta";

/** Delegated scopes the Copilot Chat API requires (Learn: copilotconversation-chat). */
export const COPILOT_SCOPES = [
  "Sites.Read.All",
  "Mail.Read",
  "People.Read.All",
  "OnlineMeetingTranscript.Read.All",
  "Chat.Read",
  "ChannelMessage.Read.All",
  "ExternalItem.Read.All",
] as const;

/** Returns a Graph access token with COPILOT_SCOPES, or null when the advisor isn't signed in. */
export type GraphTokenProvider = (scopes: readonly string[]) => Promise<string | null>;

export interface CopilotOptions {
  token: GraphTokenProvider;
  baseUrl?: () => string | undefined;
  fetch?: typeof fetch;
}

interface CopilotMessage {
  id?: string;
  text?: string;
}

export class CopilotAdapter implements ProviderAdapter {
  readonly id = "microsoft365";
  readonly #opts: CopilotOptions;

  constructor(opts: CopilotOptions) {
    this.#opts = opts;
  }

  capabilities(): Capabilities {
    return {
      json_schema: false,
      prompt_cache: false,
      effort_levels: [],
      streaming: false,
      usage_reporting: false,
      max_context: 128_000,
      max_output: 16_000,
    };
  }

  async call(req: ProviderRequest): Promise<ProviderResponse> {
    if (req.jsonSchema) throw new ProviderError("invalid_request", "microsoft365: structured output not supported");
    const token = await this.#opts.token(COPILOT_SCOPES);
    if (!token) throw new ProviderError("auth", "microsoft365: not signed in to Microsoft");
    const base = this.#opts.baseUrl?.() ?? GRAPH;
    const doFetch = this.#opts.fetch ?? fetch;
    const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };

    const post = async (url: string, body: unknown): Promise<{ json: unknown; requestId: string | null }> => {
      let res: Response;
      try {
        res = await doFetch(url, { method: "POST", headers, body: JSON.stringify(body), signal: req.signal ?? null });
      } catch (err) {
        if (req.signal?.aborted) throw err;
        throw new ProviderError("network", "microsoft365: connection failed");
      }
      if (!res.ok) {
        let code: string | null = null;
        try {
          code = ((await res.json()) as { error?: { code?: string } }).error?.code ?? null;
        } catch {
          // no JSON body
        }
        throw mapHttpFailure({ provider: this.id, status: res.status, type: code, headers: res.headers });
      }
      return { json: await res.json(), requestId: res.headers.get("request-id") };
    };

    // A conversation per call: the workflow sends its own context each time, like the other adapters.
    const conv = (await post(`${base}/copilot/conversations`, {})).json as { id?: string };
    if (!conv.id) throw new ProviderError("invalid_request", "microsoft365: no conversation id");
    req.onFirstToken?.();
    const { json, requestId } = await post(`${base}/copilot/conversations/${encodeURIComponent(conv.id)}/chat`, {
      message: { text: req.variable || req.stable },
      ...(req.variable && req.stable ? { additionalContext: [{ text: req.stable }] } : {}),
      // Web grounding is on by default and must be turned off on every message.
      contextualResources: { webContext: { isWebEnabled: false } },
    });
    const messages = ((json as { messages?: CopilotMessage[] }).messages ?? []).filter((m) => typeof m.text === "string");
    const reply = messages.at(-1)?.text ?? "";
    return {
      text: reply,
      usage: { input: 0, output: 0, cache_read: 0, cache_write: 0 },
      modelId: req.model,
      requestId,
      stopReason: "end",
    };
  }
}
