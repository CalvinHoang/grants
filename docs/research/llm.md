# LLM provider adapters: Anthropic, OpenAI (GPT-6 Astra), Microsoft 365 Copilot

Research for build spec §9 (language model interface) and §13 item 3. Date: 2026-09-27. Research only; no model is picked here.

## Summary (5 lines)
1. **Anthropic** covers everything §7 and §9 need, all confirmed in the live docs: JSON-schema structured outputs, prompt caching (512-token minimum on Opus 5.5), streaming, effort levels, 429 with `retry-after`, a Batch API at 50% off, and a contract term that forbids training on customer content.
2. **GPT-6 Astra** exists in the API as `gpt-6-astra` (launched 2026-09-03). It is $10/$50 per MTok, rising to $20/$75 above 272K input. It has strict JSON-schema output, efforts low through max, and paid cache writes. API data isn't used for training, and ZDR needs approval. OpenAI domains were blocked, so these facts come from search snippets and third parties and are marked unverified.
3. **Microsoft 365 Copilot Chat API**: a desktop app *can* call it, but only as a text-only `chat` provider. It's a beta/preview Graph endpoint that needs a Copilot licence per user, 7 broad delegated Graph scopes, and text input only (SharePoint/OneDrive files go by URI). It has no JSON schema, no token usage, no model choice and no long tasks. **Feasible for chat only; not for drafter, worker or extractor.**
4. **Adapter shape:** keep `generate(role, input, schema)`, with a stable/volatile split in the input (for caching), a per-provider capabilities record, and a common result shape (usage including cache read/write, cost, request id, stop reason). Provider errors should be mapped to one error set.
5. **Spec gaps found:** the `prices` table needs cache-write, cache-read and long-context fields. Parallel fan-out defeats caching unless one request is sent first to warm the cache. Caches are per model, so each role that uses a different model has its own cache. The Batch API is *not* ZDR-eligible. Copilot needs its own auth scopes, beyond SharePoint.

Legend: **[V]** = read in the provider's own docs this session. **[S]** = search snippet or third party, not read at the source (**unverified**). **[L]** = local copy of a Microsoft Learn page in this folder (learn.microsoft.com itself was blocked this session).

---

## 1. Anthropic Messages API

**Models and prices (base, per MTok).** Source: [A-models], [A-price], all [V].

| Model id | In / Out | 5m write / 1h write / cache read | Context / max out | Default effort |
|---|---|---|---|---|
| `claude-fable-5-1` | $10 / $50 | $12.50 / $20 / $0.25 | 1M / 128K | high (thinking always on) |
| `claude-opus-5-5` | $4 / $20 | $5 / $8 / $0.20 | 1M / 128K | **medium** (thinking always on) |
| `claude-sonnet-5` | $2 / $10 | $2.50 / $4 / $0.20 | 1M / 128K | high |
| `claude-haiku-4-5` | $1 / $5 | $1.25 / $2 / $0.10 | 200K / 64K | effort not supported |

- The Sonnet 5 price of $2/$10 is now standard; the planned rise to $3/$15 was cancelled [A-price] [V].
- Models from Claude 4.6 on bill the full 1M context at the standard rate, so there is no long-context surcharge [A-price] [V].
- Adding `inference_geo` (US-only) costs 1.1× [A-price] [V]. We don't need it.
- The Models API (`GET /v1/models`) returns `max_input_tokens`, `max_tokens` and `capabilities`. The adapter can read these at start-up instead of hard-coding limits [A-models] [V].

**Structured outputs (JSON schema).** Source: [A-so], all [V].
- How to call it: `output_config: {format: {type: "json_schema", schema}}`. It is GA with no beta header. The old `output_format` parameter is deprecated.
- Output is constrained by a grammar, so it is valid JSON.
- Schema rules:
  - `additionalProperties:false` is required on every object.
  - Not supported: `minLength`/`maxLength`, `minimum`/`maximum`, recursive schemas, and `minItems` other than 0 or 1.
  - Limits: 24 optional parameters and 16 union-typed parameters per request. "Schema is too complex" returns a 400.
- **Consequence for us:** a character limit can't go in the schema, so the §7.3 code check stays. Making every property `required` avoids the optional-parameter limit and keeps property order.
- The output can still break the schema when `stop_reason` is `refusal` or `max_tokens`. Enum values may also come back in the wrong case, so compare them case-insensitively.
- Compiled schemas are cached for 24 h. The first request with a new schema is slower.
- Changing the format invalidates the prompt cache.
- **Citations don't work with structured outputs** (400). This supports the spec's approach of returning paragraph IDs rather than using Citations.
- Supported on all current models, including Haiku 4.5.

**Prompt caching.** Source: [A-cache], [A-price], [A-rl], all [V].
- How to mark it: `cache_control: {type:"ephemeral"}` on a block (up to 4 breakpoints), or at the top level for automatic caching. Setting `ttl:"1h"` gives a 1-hour cache.
- The cache matches a prefix in the order tools → system → messages. Any byte that changes invalidates everything after it.
- Minimum prefix that caches: **512 tokens** for Opus 5.5, Opus 5 and Fable 5.x; **1,024** for Sonnet 5; **4,096** for Haiku 4.5. Shorter prefixes silently don't cache.
- Price effect:
  - A 5-minute write costs 1.25× input; a 1-hour write costs 2×.
  - A read costs 0.1× input (0.05× on Opus 5.5, 0.025× on Fable 5.1).
  - The TTL starts at the start of the request and each hit refreshes it.
- Caches are kept separate per workspace and per model.
- **A cache entry can only be read once the first response starts streaming.** N parallel requests with the same prefix all pay full price. So for fan-out, send one request, wait for its first token, then release the rest. This affects §7.8 ("all ready fields in parallel").
- Cache reads don't count toward the input-tokens-per-minute (ITPM) limit, which raises effective throughput.
- To check caching works, look at `usage.cache_read_input_tokens` and `usage.cache_creation_input_tokens`.

**Streaming.** Source: [A-stream] [V].
- Set `stream: true` to get server-sent events (SSE): `message_start`, then `content_block_start`/`content_block_delta`/`content_block_stop`, then `message_delta` and `message_stop`, with `ping` and `error` events mixed in.
- The SDKs need streaming for very large `max_tokens` values (up to 128K output) to avoid HTTP timeouts. Their `finalMessage()` helper collects the full result [skill: claude-api].

**Effort and adaptive thinking.** Source: [A-effort], [A-models], all [V].
- How to set it: `output_config.effort` = `low|medium|high|xhigh|max`.
- On Opus 5.5 and Fable 5.x, thinking is always on. Sending `thinking:{type:"disabled"}` or `budget_tokens` returns a 400 [skill: claude-api].
- Haiku 4.5 has no effort setting. It still uses `thinking:{type:"enabled", budget_tokens}` [A-models].
- Assistant prefill returns a 400 on current models. Use structured outputs instead [skill: claude-api].
- Effort changes the prompt that gets rendered, so the fingerprint in §7.8 must include it. The spec already does this.

**Rate limits and 429.** Source: [A-rl], [A-err], all [V].
- Limits are counted in requests per minute (RPM), input tokens per minute (ITPM) and output tokens per minute (OTPM) per model class, refilled continuously as a token bucket.
- Tier 1 example: Opus 5.5 and Sonnet 5 allow 1,000 RPM, 2M ITPM and 400K OTPM. Fable 5.x allows 500K ITPM and 100K OTPM.
- A 429 comes with a `retry-after` header in seconds, **except** when the monthly spend cap is hit: that 429 has no `retry-after` and retrying won't work until the cap resets.
- Other errors: 529 `overloaded_error` and 500 `api_error` should be retried with exponential backoff.
- Useful headers: `anthropic-ratelimit-{requests,tokens}-{limit,remaining,reset}`, and `request-id`, which should be logged in `calls`.
- `max_tokens` doesn't count toward OTPM.
- The SDK retries 408, 409, 429 and 5xx twice by default [skill: claude-api].

**Batch API.** Source: [A-batch], [A-ret], all [V].
- Endpoint: `POST /v1/messages/batches`. It costs 50% off both input and output, and caching discounts stack on top.
- Limits: 100,000 requests or 256 MB per batch. Most batches finish within 1 h; anything not done in 24 h expires.
- Results are kept for 29 days.
- **Not ZDR-eligible** (29-day retention).
- It isn't suited to the interactive Run. It could serve a later "re-assess everything overnight" job, or `askMany` on the LLM stand-in decider.

**Data terms.** Sources: [A-terms], [A-ret], [A-so], all [V] unless noted.
- The Commercial Terms say "Anthropic may not train models on Customer Content from Services" [A-terms]. This meets Calvin's rule that no-training API terms are enough.
- Retained data "is never used for model training without your express permission" [A-ret].
- ZDR is by arrangement with sales, per organisation [A-ret].
- Prompt caching is ZDR-eligible. Structured outputs are eligible with a qualification: the schema itself is cached for 24 h [A-ret] [A-so].
- **Covered Models** (Fable 5, Fable 5.1, Mythos) need 30-day retention. An org on ZDR gets a 400 unless one workspace turns on 30-day retention [A-ret].
- Whether Opus 5.5 is available under ZDR isn't stated. Treat it like Opus 5, which is ZDR-available [skill: claude-api] (**unverified**).
- The default commercial retention period is in a policy linked from [A-ret] that wasn't read (**unverified**).

**Refusals.** Opus 5.5 and Fable 5.1 run safety classifiers. A refusal comes back as HTTP 200 with `stop_reason:"refusal"`, so the adapter must check `stop_reason` before parsing. There is an optional server-side `fallbacks` parameter in beta [skill: claude-api].

## 2. OpenAI API: GPT-6 Astra

OpenAI's own sites (developers.openai.com, openai.com) and most third-party pages were **blocked** this session. Everything below is **[S]** unless it's the LiteLLM price file (a third party, read directly, still **[S]**).

- **Release and access:**
  - Launched 2026-09-03 in a staged rollout: some organisations on day one, then ChatGPT plans, the API and AWS [O-cnbc] [O-search1].
  - Also offered on Amazon Bedrock and Microsoft Foundry [O-search1] [O-aws].
  - Specs: 1,050,000-token context, 128K max output, text and image input, knowledge cutoff 2026-04-30 [O-search1] [O-model].
- **Model id:** `gpt-6-astra` [O-model] [O-litellm]. Pinned snapshots are mentioned but no dated id was found (**unverified**).
- **Endpoints:**
  - Responses API is recommended. Chat Completions works, but tool calling needs Responses [O-search2]. Batch is also supported [O-litellm].
  - The adapter should target `/v1/responses` with `store:false` and resend the full input each time (see ZDR below).
- **Structured outputs:**
  - Responses API: `text.format: {type:"json_schema", name, strict:true, schema}`. Chat Completions: `response_format` [O-search3] [O-so].
  - Strict mode needs `additionalProperties:false` and every property listed in `required` [O-search3].
  - The same schema can serve both providers if we write it to the stricter rule set (all properties required, no min/max).
- **Reasoning effort:**
  - Responses API: `reasoning.effort`. Chat Completions: `reasoning_effort`.
  - Values: `low|medium|high|xhigh|max`. `none` and `minimal` return 400 [O-search2] [O-pr81].
  - Chat Completions reportedly accepts up to `xhigh` only [O-pr81].
  - A non-default temperature is only allowed with effort `none`, so no temperature can be set on Astra [O-search3].
- **Prompt caching:**
  - Automatic for prompts of 1,024+ tokens.
  - Explicit breakpoints (`prompt_cache_breakpoint` on a content block, plus `prompt_cache_options.mode:"explicit"`) exist from GPT-5.6 on [O-cache].
  - TTL is `prompt_cache_options.ttl:"30m"` [O-search4].
  - **Astra bills a cache write on every cached prompt** ($12.50/MTok, 1.25× input), reported as `prompt_tokens_details.cache_write_tokens`. Cache reads cost $1/MTok [O-pr81] [O-litellm].
- **Prices (per MTok) [O-litellm] [O-search5]:**

  | | Standard | Above 272K input (whole request) |
  |---|---|---|
  | Input / cached read / cache write / output | $10 / $1 / $12.50 / $50 | $20 / $2 / $25 / $75 |

  Batch and Flex cost 0.5×. Priority costs 2×. US or EU regional processing costs 1.1×.
- **Rate limits:** Tier 1 is 500 RPM and 500K TPM; Tier 5 is 15,000 RPM and 40M TPM [O-search6]. Rate-limit header names weren't checked for Astra; OpenAI normally uses `x-ratelimit-*` headers and `retry-after` (**unverified**).
- **Data terms:**
  - API data isn't used for training unless the customer opts in [O-data] [O-zdr].
  - By default OpenAI keeps inputs and outputs up to 30 days for abuse monitoring [O-search7].
  - ZDR is available to eligible customers with OpenAI's prior approval. OpenAI is keeping ZDR for frontier models by adding "Private Safety Processing" [O-zdr].
  - **Gotcha:** with ZDR, `previous_response_id` returns 400 ("Previous response cannot be used … due to Zero Data Retention"), so the adapter must be stateless [O-zdr-issue].
- **Safety:** Astra is OpenAI's first model rated "Critical" for cybersecurity capability. It has more conservative boundaries for "higher-risk accounts" [O-infoq]. This shouldn't affect grant writing, but the adapter should still handle refusals.

## 3. Microsoft 365 Copilot for the chat box

Sources: local copies of the Learn pages in this folder, **[L]**: chat overview, `chat` and `chatOverStream` reference, context resources, APIs overview, cost page, Work IQ pages.

| Question | Finding |
|---|---|
| Can a third-party desktop app call it? | Yes. Microsoft Graph REST with a delegated user token acquired through MSAL. Flow: `POST https://graph.microsoft.com/beta/copilot/conversations` to create a conversation, then `…/{id}/chat` (synchronous) or `…/{id}/chatOverStream` (SSE) [M-chat] [M-stream] [L]. |
| Status | Preview, on the `/beta` endpoint only [M-overview] [L]. |
| Licensing | "Available at no extra cost to users with a Microsoft 365 Copilot add-on license. Support for users without [one] isn't currently available." It also needs an E3/E5 (or similar) Microsoft 365 plan [M-overview] [M-apis] [L]. **Unknown whether Calvin has a licence.** |
| Successor | Work IQ API (REST, A2A, MCP) went GA on 2026-06-16. It is billed in Copilot Credits by usage [M-workiq] [L] [M-blog]. Snippets say it doesn't need a Copilot seat [M-search1] [S]. It uses a different host (`workiq.svc.cloud.microsoft`) [M-workiq] [L]. Its REST limits match the Chat API's [M-workiq-rest] [L]. |
| Auth scopes | Delegated only (no app-only, no personal accounts). The app needs **all** of: `Sites.Read.All, Mail.Read, People.Read.All, OnlineMeetingTranscript.Read.All, Chat.Read, ChannelMessage.Read.All, ExternalItem.Read.All` [M-chat] [L]. Several of these probably need tenant admin consent (**unverified**). This is much broader than the planned "SharePoint link only" sign-in. |
| Limits | No long-running tasks (gateway timeouts). Text-only replies. No tools or actions. Subject to all semantic-index limits [M-overview] [L]. No published per-user throttling numbers; standard Graph throttling applies [M-search2] [S]. |
| Web grounding | On by default. Turning it off applies **to one message only**: `contextualResources.webContext.isWebEnabled:false` must be sent every time [M-overview] [M-chat] [L]. |
| Enterprise grounding | Always on. No switch to turn it off is documented [M-overview] [L]. Answers can draw on the advisor's mail, Teams and other tenant content. That is a cross-client risk for an advisory firm (an inference from the docs). |
| Our own context | Text can be passed as `additionalContext[] {text, description}`, with no documented size limit (**unverified**). Files can only be passed as OneDrive/SharePoint URIs (`contextualResources.files[].uri`), so local client files can't be attached [M-ctxmsg] [M-files] [L]. |
| Structured output | None. The request body has no format or schema parameter. The reply is markdown text plus `attributions`, `adaptiveCards` and `sensitivityLabel` [M-chat] [L]. |
| Usage and cost | The response example has no token-usage fields [M-chat] [L]. Per-call cost can't be computed for `calls`. |
| Model and effort | Not selectable. Copilot picks its own model and orchestration [M-overview] [L] (inference: no parameter exists). |

**Conclusion: feasible, but only as a restricted `chat` provider. Not feasible for drafter, worker, extractor or decider.** Build it as an optional adapter that is off by default, with capabilities `{schema:false, caching:false, usage:false, effort:false}`. Show it in the chat selector only after a probe call succeeds; a 403 or licence error hides it.

What we'd lose compared with Claude or Astra in chat:
- Schema-checked answers.
- Control over the prompt: Copilot adds its own system behaviour and tenant/web grounding.
- Cost tracking.
- Caching.
- Model choice and effort.
- Citing our paragraph IDs. Its citations point to M365 or web items, not our passages.
- Deterministic grounding: an answer may mix in unrelated tenant data.

What we'd gain:
- The data stays inside the M365 trust boundary.
- It can answer from the advisor's SharePoint and mail.

The cost of building it: the Entra app needs the 7 extra scopes (probably with admin consent), plus a per-user Copilot licence or Work IQ credits. Recommendation: phase 2, and only if Calvin has a licence.

## 4. Recommended adapter interface

Keep the spec's single entry point. Make the input shape reflect caching, and make the output carry everything `calls` needs:

```ts
generate(role: RoleName, input: GenInput, schema?: JSONSchema, opts?: {stream?: (delta)=>void, signal?}) : Promise<GenResult>
GenInput  = { stable: Block[]  /* system rules, grant ctx, reference, field Q — cache prefix, byte-identical */,
              volatile: Block[] /* passages, redraft guidance, chat turns */,
              history?: Turn[] /* chat only */, max_output_tokens?: number }
GenResult = { output: unknown /* schema-validated */ | null, text?: string, stop: "end"|"max_tokens"|"refusal",
              usage: {input, cache_write, cache_read, output, reasoning?}, cost_usd, model_id,
              provider_request_id, latency_ms, attributions?: [] }
Errors    = RateLimited{retry_after_s} | Overloaded | SpendCapReached | Refused | Truncated
            | SchemaRejected | ContextTooLong | AuthOrLicense | RetentionPolicy | Transient
```

- The adapter resolves `role` through `models.json` and returns a **capabilities record**:
  - `structured: native|none`
  - `caching: {mode: explicit|auto|none, min_tokens, ttl_options}`
  - `effort_levels[]`, `max_context`, `max_output`, `batch: bool`, `usage_reported: bool`

  The workflow checks capabilities rather than provider names. Example: a role that needs a schema can't map to Copilot, and Settings rejects that mapping.
- Validate the output against the schema in code for **every** provider, even ones with constrained decoding: refusals and max_tokens can still break the schema. Allow one automatic retry, as §7.3 already has.
- Extend `models.json`:
  - Per role: `max_output_tokens`, `cache_ttl` (`5m|1h|30m`), optional `fallback_model`.
  - `prices` rows need `input, output, cache_write_5m, cache_write_1h, cache_read, long_context: {threshold_tokens, multiplier_in, multiplier_out}, batch_multiplier`. Without these, cost is wrong on both providers (Astra's cache-write charge, Astra's rate above 272K).

**Provider mapping inside adapters:**

| Common option | Anthropic | OpenAI (Astra) [S] | Copilot [L] |
|---|---|---|---|
| schema | `output_config.format` json_schema | `text.format` json_schema `strict:true` | not supported → error for roles needing schema |
| stable/volatile | `cache_control` on last stable block (1h TTL if gaps > 5 min) | `prompt_cache_breakpoint` on last stable block, `prompt_cache_options` | `additionalContext` text; no caching |
| effort | `output_config.effort` (Haiku: `budget_tokens` or none) | `reasoning.effort` (no none/minimal) | ignored |
| stream | SSE `stream:true` | SSE `stream:true` | `chatOverStream` |
| usage | `usage.{input,cache_creation,cache_read,output}_tokens` | `usage…cached_tokens`, `cache_write_tokens` | none → cost unknown |
| rate limit | `anthropic-ratelimit-*`, `retry-after` | `x-ratelimit-*`, `retry-after` (**unverified**) | Graph throttling 429 `Retry-After` (**unverified**) |
| state | stateless | stateless: `store:false`, no `previous_response_id` | server-side conversation id (keep per chat thread) |
| grounding off | n/a | n/a | send `webContext.isWebEnabled:false` every message |

**Limiter behaviour.** Per provider and model:
- Keep a token bucket fed from the rate-limit headers.
- Group fields by shared stable prefix. Send one request per group first, and release the rest when its first streamed token arrives (the Anthropic rule above).
- On 429, back off by `retry-after`. When there's no `retry-after` (Anthropic spend cap), pause the run and tell the advisor.

**Put in shipped `models.json` defaults, not code:** use the provider's model-list endpoint at WP-6 (§9.2) to fill in ids. Per-model limits come from the Models API (Anthropic) or the capabilities record.

---
### Sources
- [A-models] https://platform.claude.com/docs/en/about-claude/models/overview [V]
- [A-price] https://platform.claude.com/docs/en/about-claude/pricing [V]
- [A-so] https://platform.claude.com/docs/en/build-with-claude/structured-outputs [V]
- [A-cache] https://platform.claude.com/docs/en/build-with-claude/prompt-caching [V]
- [A-stream] https://platform.claude.com/docs/en/build-with-claude/streaming [V]
- [A-effort] https://platform.claude.com/docs/en/build-with-claude/effort [V]
- [A-rl] https://platform.claude.com/docs/en/api/rate-limits [V]
- [A-err] https://platform.claude.com/docs/en/api/errors [V]
- [A-batch] https://platform.claude.com/docs/en/build-with-claude/batch-processing [V]
- [A-ret] https://platform.claude.com/docs/en/manage-claude/api-and-data-retention [V]
- [A-terms] https://www.anthropic.com/legal/commercial-terms [V]
- [skill: claude-api] Anthropic's bundled claude-api skill (cached 2026-06-24), used for SDK behaviour only
- [O-model] https://developers.openai.com/api/docs/models/gpt-6-astra (blocked; seen as a search result) [S]
- [O-so] https://developers.openai.com/api/docs/guides/structured-outputs (blocked) [S]
- [O-cache] https://developers.openai.com/api/docs/guides/prompt-caching (blocked) [S]
- [O-data] https://developers.openai.com/api/docs/guides/your-data (blocked) [S]
- [O-zdr] https://openai.com/index/offering-zero-data-retention-for-frontier-models/ (blocked; seen as a search result) [S]
- [O-cnbc] https://www.cnbc.com/2026/09/03/open-ai-astra-gpt-6-cyber.html [S]
- [O-aws] https://aws.amazon.com/blogs/machine-learning/take-on-your-most-ambitious-work-with-gpt-6-astra-on-amazon-bedrock/ [S]
- [O-litellm] https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json (read directly; its source field cites developers.openai.com/api/docs/pricing) [S]
- [O-pr81] https://github.com/cocoonstack/gateway/pull/81 (read directly) [S]
- [O-zdr-issue] https://github.com/openclaw/openclaw/issues/138954 (read directly) [S]
- [O-infoq] https://www.infoq.com/news/2026/09/gpt-6-astra-critical-cyber/ [S]
- [O-search1…7] search snippets from: https://www.mindstudio.ai/blog/gpt-6-astra-pricing-access, https://evolink.ai/blog/gpt-6-astra-api-guide, https://www.elser.ai/news/gpt-6-astra-api-tutorial-responses-api, https://chatgptaihub.com/gpt-6-astra-prompt-caching-explicit-breakpoints-cache-keys-ttl-long-context-cost, https://www.atlascloud.ai/blog/tips/gpt-6-astra-long-context-cost, https://kingy.ai/news/gpt-6-astra-access-chatgpt-api-daybreak/, https://medium.com/@jeffkessie50/openais-zero-data-retention-policy-916ff04a3599 [S]
- [M-overview] https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/api/ai-services/chat/overview [L] (chatapi.md)
- [M-chat] …/api/ai-services/chat/copilotconversation-chat [L]; [M-stream] …/chat/copilotconversation-chatoverstream [L]
- [M-ctxmsg] …/chat/resources/copilotcontextmessage [L]; [M-files] …/chat/resources/copilotcontextualresources, …/copilotfile [L]
- [M-apis] https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/copilot-apis-overview [L]; cost page …/extensibility/cost-considerations [L]
- [M-workiq] Work IQ API overview (ms_workiq.md) [L]; [M-workiq-rest] Work IQ REST overview (ms_workiq_rest.md) [L]
- [M-blog] https://www.microsoft.com/en-us/microsoft-365/blog/2026/06/02/announcing-the-new-work-iq-apis/ [V, fetched]
- [M-search1] https://windowsforum.com/news/microsoft-365-work-iq-apis-add-metered-access-without-seats.445344/ and https://m365admin.handsontek.net/general-availability-work-iq-api-copilot-credits-billing/ [S]
- [M-search2] https://spknowledge.com/2026/08/17/microsoft-365-copilot-api-rate-limits-error-handling-national-cloud/ [S]
