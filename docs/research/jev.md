# jev (TypeSafe AI): what is publicly documented (research for spec §8 and §13)

**Summary**
1. There is one inference endpoint, `POST https://api.typesafe.ai/v1/systemone` (Bearer key). It takes one `state` plus a named map of typed questions (`noul` yes/no, `choice`, `score`) and returns typed answers with probabilities. `GET /v1/models` lists models. There is **no** streaming, no text output, no batch-job endpoint and no document classification or splitting endpoint. "Splitting" is DocJev, a third-party OSS library.
2. Limits (Jev 1.13): 64K tokens per request in total, **32K for state + the longest single question**, 250K tokens/s, 1,200 requests/min (said to be "adjusting dynamically"), text only, English primary. Price: $0.042 per million input tokens; output is free.
3. Official SDKs: Python `typesafe-sdk` 0.7.2 and TypeScript `@typesafe-ai/sdk` 0.6.0, both MIT. There is no OpenAI-compatible interface from TypeSafe. OpenRouter hosts jev through a separate "Decisions" API (unverified).
4. Data terms: TypeSafe does not train on customer requests or responses, the same weights serve everyone, and ZDR is available for enterprise. Hosting region and retention period are unverified (the DPA page is blocked here).
5. Design impact: Noul answers have **no `confidence` field**. Choice/Score `confidence` is a spread statistic, not P(correct). One independent test found raw jev probabilities miscalibrated (ECE 0.117) and Choice "99%" answers right only ~90% of the time. The 0.99 threshold must be calibrated on our own data, as spec §8 already requires for the LLM stand-in.

**How this was researched.** docs.typesafe.ai, typesafe.ai, pydantic.dev, openrouter.ai, litellm, mindstudio, beam.ai, dev.to and marktechpost are **blocked by this sandbox's egress proxy**. Sources used instead:
- (a) The official SDK packages, downloaded from PyPI and npm and read directly. The Python wire models are generated from `https://api.typesafe.ai/openapi.json`.
- (b) Verbatim copies of docs.typesafe.ai pages in a GitHub mirror, https://github.com/IamKrill1n/typesafe-docs/tree/main/raw. This is unofficial, but each page carries the official "Documentation Index … docs.typesafe.ai/llms.txt" header. Cited below as "docs (mirror)", with the official URL.
- (c) GitHub repositories.
- (d) Search-result snippets, marked *snippet*.

Nothing was tested against the live API.

---

## 1. API shape

| Item | Finding | Source |
|---|---|---|
| Endpoint | `POST https://api.typesafe.ai/v1/systemone`. Every model is served by this one endpoint and `model` selects which | docs (mirror) https://docs.typesafe.ai/models ; SDK `_core/constants.py` (`SYSTEM_ONE_PATH = "/v1/systemone"`) |
| Other endpoint | `GET /v1/models` returns `{models:[{name, description, release_date}]}`. It lists aliases. Versioned IDs such as `jev-1.13.0` are accepted even though they are not listed | docs (mirror) https://docs.typesafe.ai/models |
| Auth | `Authorization: Bearer <API_KEY>`. Env var `TYPESAFE_API_KEY`; the SDK also reads `TYPESAFE_BASE_URL` and `TYPESAFE_DEFAULT_MODEL` | docs (mirror) https://docs.typesafe.ai/introduction/quickstart ; https://pypi.org/project/typesafe-sdk/ (0.7.2 `constants.py`, `transport.py`) |
| Request | `{ model, state, questions }`. `state` is a string, JSON object or array. `questions` is a map of your chosen name to a question (min 1). Questions have no `id`; the map key is the id and "the model never sees the question id" | SDK `_schemas/models.py` (generated from api.typesafe.ai/openapi.json); docs (mirror) https://docs.typesafe.ai/primitives/choice |
| Question types | **noul** (yes/no or true/false statement; optional `criteria.true/false`). **choice** (`criteria` = map of option name to description or null). **score** (`criteria` = ordered list of level descriptions, scored from 0). `instructions` is optional and can be a string, object or array | SDK `_schemas/models.py`, `_core/question_types.py` |
| Response | `{ model: "<versioned id>", answers: {name: answer}, usage: {input_tokens, output_tokens} }` | SDK `_schemas/models.py` |
| Noul answer | `{type:"noul", noul: 0..1}`: probability of yes. **No confidence field** ("Noul answers don't carry one") | SDK wire model; docs (mirror) https://docs.typesafe.ai/confidence |
| Choice answer | `{choice, confidence, probabilities:{option:p}}`. `choice` = highest-probability option; probabilities sum to about 1 | SDK wire model |
| Score answer | `{score (expected value, can fall between levels), confidence, legend:{"0":…}, probabilities:{"0":p,…}}` | SDK wire model |
| Probability answers | "Probability" is not a separate type: use a Noul (its value is P(yes)) | as above |
| How confidence is computed | "`confidence` is a statistic computed from the probability distribution the answer already gives you." Concentrated means high, flat means low. The docs give no formula. Independent tests find Choice confidence = (p_max − 1/K)/(1 − 1/K), e.g. 2-option p=0.72 gives confidence 0.45 | docs (mirror) https://docs.typesafe.ai/confidence ; https://github.com/AnthusAI/Jev-Calibration ; https://github.com/jiji-hoon96/jihoon-blog (content/260922/index.en.md) |
| Precision | Probabilities appear rounded to 2 decimals on jev-1.13.0 (observed, not documented) | https://github.com/AnthusAI/Jev-Calibration |
| Doc classification | No endpoint. Classification is a Choice question over document text | API ref has only the two endpoints: SDK `endpoints.py`; docs (mirror) https://docs.typesafe.ai/models |
| Doc splitting | No endpoint. **DocJev** (github.com/jerryjliu/docjev, Jerry Liu, "independent open-source implementation") splits a packet by asking jev per page boundary. Text comes from local LiteParse | https://github.com/jerryjliu/docjev (README) |
| Batching | No batch-job API. Instead, many questions share one state in a single call, "evaluated in parallel, so adding more questions usually has little effect on response time". Docs cookbook: 13 questions in 1 call was "11.5x cheaper and 9.6x faster" than 13 calls | docs (mirror) https://docs.typesafe.ai/patterns/fan-out ; https://docs.typesafe.ai/primitives |
| Streaming | None: "no OpenAI-compatible chat API, no streaming" (*snippet*). The SDKs have no stream method | SDK source (no stream API); *snippet* https://github.com/truefoundry/trueforge/pull/819 |
| Errors | 401 bad key; 422 validation; 429 rate limit; 529 overloaded (retry with backoff). Over-limit tokens: one tester saw HTTP 400 `max_tokens_exceeded`, another an "opaque 422". The code for running out of credit is **unverified** | docs (mirror) https://docs.typesafe.ai/api ; https://github.com/pydantic/genai-prices/pull/720 ; https://github.com/Alberto-Codes/judgevet/issues/39 |
| Model IDs | `jev-1.13.0`. Aliases `jev-latest` and `jev-preview` both point to it. The docs advise pinning the versioned ID if you tuned thresholds | docs (mirror) https://docs.typesafe.ai/models |

Minimal request (from docs quickstart):
```json
POST /v1/systemone
{"model":"jev-1.13.0","state":"<text or JSON>",
 "questions":{"dg4_row12":{"type":"noul","instructions":"…","criteria":{"true":"…","false":"…"}},
              "gap":{"type":"choice","instructions":"…","criteria":{"missing_evidence":"…","other":null}}}}
```

## 2. Limits

| Limit | Value | Source |
|---|---|---|
| Tokens per request | "64k tokens per request; 32k tokens for `state` plus the longest question". State is counted once | docs (mirror) https://docs.typesafe.ai/models |
| Empirical | 32,878 input tokens accepted; larger requests rejected (400). Pydantic's price DB sets the context window to 32K | https://github.com/pydantic/genai-prices/pull/720 |
| Rate limits | 250,000 tokens/s and 1,200 requests/min. "Adjusting dynamically … can change without notice". Higher limits on custom/enterprise plans | docs (mirror) https://docs.typesafe.ai/models |
| Concurrency | No documented concurrency cap. One tester saw no rate limiting at concurrency 8 | https://github.com/AnthusAI/Jev-Calibration |
| Latency | No official SLA. Measured medians: 0.24 s (~330-token requests); 139 ms (classify) and 210 ms (split) at concurrency 1. The "70–500 ms end to end" figure is *snippet*, unverified | https://github.com/AnthusAI/Jev-Calibration ; https://github.com/jerryjliu/docjev ; *snippet* firecrawl.dev/blog/what-is-jev |
| SDK timeout / retries | Default 10 s per HTTP operation. 2 retries with backoff (0.5 s up to 5 s) on 408/429/5xx, honouring `retry-after`; 30 s total retry budget | SDK `constants.py`, `_core/retry.py` |
| Choice options | "up to 255 options" per Choice | docs (mirror) https://docs.typesafe.ai/primitives/choice and /api |
| Score levels / questions per request | No documented maximum (only min 1). Bounded in practice by the 64K budget | SDK wire model (`min_length=1`); unverified |
| Input | Text only (string, JSON object or array). English primary; other languages "not equally well" | docs (mirror) https://docs.typesafe.ai/models |
| Uptime | "no uptime SLA" in the MCA (*snippet*, unverified). Status page: https://status.typesafe.ai | *snippet* jevwiki.ai legal page |

## 3. Pricing, credits, access

- **Price:** $42 per billion (so $0.042 per million) input tokens. Output tokens are free. Charged per input token. Source: docs (mirror) https://docs.typesafe.ai/models; the same figure is in the independent test at https://github.com/AnthusAI/Jev-Calibration.
- **Our scale:** 45 questions × ~30K-token state is about 1.35M tokens if each question is sent separately (≈ $0.06), or about 30K tokens if they are packed into one request (< $0.01). Cost is negligible either way. This is my own arithmetic.
- **Credits and billing:** there is no public plan-tier table (*snippet* https://www.eesel.ai/blog/typesafe-jev-pricing). Prepaid versus postpaid billing is **unverified**.
- **Access:**
  - Launched 2026-09-15 with a waitlist. The model release_date is 2026-09-15 (SDK schema example; docs (mirror) models page).
  - Third-party news says the waitlist was removed around 20–21 Sept with $5 of starter credit, and that **new signups were paused on 22 Sept**. Existing accounts kept working. All *snippet*, **unverified**: https://cryptobriefing.com/typesafe-jev-ai-public-access/ , https://jevainews.com/news/typesafe-signups-paused/
- **Getting a key:** log in at https://console.typesafe.ai, create a key at https://console.typesafe.ai/keys, then try the Playground at https://console.typesafe.ai/playground. Source: docs (mirror) https://docs.typesafe.ai/introduction/quickstart. Calvin already has an account, per spec §13.2.
- **Other routes:** OpenRouter lists `typesafe/jev-1.13`, and Vercel AI Gateway lists `typesafe-ai/jev`. With OpenRouter, point the SDK base URL at OpenRouter and use an OpenRouter key. All *snippet*, unverified: https://openrouter.ai/typesafe/jev-1.13 , https://github.com/Charlyhno-eng/jev-document-classification

## 4. Data terms

| Item | Finding | Source |
|---|---|---|
| Training | "Jev is not trained on customer requests or responses." Not fine-tuned or LoRA-adapted with customer data; "the same weights serve every account" | docs (mirror) https://docs.typesafe.ai/models |
| Legal docs | DPA https://typesafe.ai/legal/data-processing ; MCA https://typesafe.ai/legal/mca ; Privacy https://typesafe.ai/legal/privacy-policy (all blocked here; not read) | docs (mirror) https://docs.typesafe.ai/legal |
| Retention | The DPA covers "data retention". Terms not read. ZDR "for enterprise customers" (contact sales@typesafe.ai) | docs (mirror) https://docs.typesafe.ai/legal |
| Telemetry carve-out | TypeSafe may process telemetry (logs, metrics, classifications, aggregates) to improve services. Customer data is not used for training without consent. *snippet*, **unverified** | https://wonderwhy-er.medium.com/typesafe-jev-wont-train-on-your-data-it-can-still-learn-from-it-563f0ad591b6 |
| Hosting | "Hosted in the US". *snippet*, **unverified** (Calvin has said AU residency is not required) | *snippet* https://www.requesty.ai/models/typesafe |

## 5. SDKs and compatibility

- **Python:**
  - Package `typesafe-sdk` 0.7.2 (MIT, Python ≥3.10, "Production/Stable", Windows listed). Sync `TypeSafeClient` and async client; `client.system_one(state=…, questions={…})`.
  - Typed `Noul`, `Choice` and `Score` classes. Optional `[http2]` extra. `extra_body` passes unknown fields through.
  - Sources: https://pypi.org/project/typesafe-sdk/ ; https://github.com/typesafe-ai/typesafe-sdk-python
- **TypeScript:** `@typesafe-ai/sdk` 0.6.0 (MIT, Node ≥20, ESM and CJS), `client.systemOne({state, questions})`. Source: https://www.npmjs.com/package/@typesafe-ai/sdk ; repo github.com/typesafe-ai/typesafe-sdk-js
- **Community SDKs:** Go, Java, Rust, Ruby, PHP, .NET and C++, all unofficial. Search: https://github.com/search?q=typesafe-sdk
- **OpenAI-compatible:** none from TypeSafe. Community bridges exist, for example https://github.com/RevocGG/typesafe-jev-bridge. LiteLLM has a pass-through page (https://docs.litellm.ai/docs/pass_through/typesafe, *snippet*). Pydantic AI has a TypeSafe model page (https://pydantic.dev/docs/ai/models/typesafe/, *snippet*).
- **Consequence for us:** the §8 `jev` adapter should call `/v1/systemone` directly, or wrap the official SDK in the engine's language. It cannot reuse the §9 LLM adapter.

## 6. What affects our design

1. **Map §8 kinds to jev types.**
   - `probability` → Noul. value = `noul`. jev returns no confidence, so the adapter must derive one, e.g. `max(p, 1-p)`, or threshold on p directly.
   - `choice` → Choice. value = `choice`; confidence and probabilities come back.
   - `score` → Score. value = expected `score`, or the argmax level from `probabilities`.
   - The docs warn: "Don't carry a threshold tuned on a Noul over to a Choice" (docs (mirror) https://docs.typesafe.ai/model-jaggedness/jev-1.13). So keep thresholds **per kind**, not one global 0.99.
2. **Is 0.99 realistic?** Only with local calibration.
   - TypeSafe's own position: calibration describes "groups of predictions, not a guarantee about any single answer", and "The correct threshold values depend on your domain … test with your own data". The docs' example gates at 0.5 and 0.9 (docs (mirror) https://docs.typesafe.ai/introduction/machine-learning-primer , https://docs.typesafe.ai/confidence).
   - Independent test on jev-1.13.0 (8,801 sentiment items): raw ECE 0.117. Noul answers above 95% were 100% correct (2,104/2,104). Choice's top band was 99.4% mean confidence but only **90.2% accurate**, and below 95% Choice confidence was near coin-flip. Isotonic calibration took ECE to 0.008 with a few hundred labels (https://github.com/AnthusAI/Jev-Calibration).
   - DocJev: "Neither [probability nor confidence] is claimed to be calibrated" (https://github.com/jerryjliu/docjev).
   - Recommendation:
     - DG-4 (passage supports row) and P(compelling) or P(eligible) should be **Noul** questions; they behave best at the extremes.
     - Fit the jev threshold, or an isotonic map, from the WP-11 synthetic-client run, as §8 already requires for the LLM stand-in.
     - With 2-decimal rounding, "≥0.99" means the top one or two buckets only.
     - Pin `jev-1.13.0` so tuned thresholds do not drift when `jev-latest` moves.
3. **Choice size:** 7 gap types and DG-1..3 document classes are well under the 255-option cap. The docs recommend adding an `other` or "none of the above" option (docs (mirror) https://docs.typesafe.ai/primitives/choice).
4. **Token budget sets how `askMany` batches.** Group questions by shared state, and send one request per state with all of that state's questions. Keep state + longest question ≤ 32K (aim for ≤ ~28K to leave margin; token counting is server-side). Split into further requests when all questions together would exceed 64K. A full CRC-P application plus client documents will not fit in one state, so send only the relevant paragraphs per row (digest by reference). The docs also warn that accuracy drops with "large state full of irrelevant detail" (docs (mirror) https://docs.typesafe.ai/model-jaggedness/jev-1.13).
5. **Known weak spots** (jaggedness page): literal reading of questions, counting and numbers, date comparison, indirection, contradictory instructions, and no generation. Implications for us: do eligibility arithmetic such as dollar thresholds, dates and headcounts **in code**, and ask jev only for the judgement part (docs (mirror) https://docs.typesafe.ai/model-jaggedness/jev-1.13).
6. **Rate limits are generous** for ~45 questions per pass: one to a few requests per field. The adapter still needs to handle 429 and 529 with backoff; the SDK default does this.
7. **"Classification and splitting" in CONTEXT.md is not a jev feature.** DG-1..3 become ordinary Choice or Noul calls over extracted text. Any PDF splitting would reuse DocJev's per-page-boundary pattern, or be out of scope.
8. **Still open (spec §13.2, needs Calvin's account):** exact token counting for our text, error code when credit runs out, prepaid versus postpaid billing, DPA retention period, hosting region, current signup status, and real latency from Australia to the US.

## 7. pstack (Lauren Tan, @poteto)

- **What it is:** an MIT-licensed **Cursor plugin** by Lauren Tan (© 2026), v0.15.5. It lives in Cursor's official plugin repo at https://github.com/cursor/plugins/tree/main/pstack. Licence: https://github.com/cursor/plugins/blob/main/pstack/LICENSE; manifest `pstack/.cursor-plugin/plugin.json` says `"license": "MIT"`.
- **Contents:**
  - 47 skills: `poteto-mode` (entry point, 23 playbooks such as bug-fix, feature, perf, investigation and hillclimb), `setup-pstack`, `architect`, `arena`, `swarm`, `interrogate`, `tdd`, `unslop`, `how`/`why`, `technical-writing`, `typescript-best-practices`, plus 23 `principle-*` skills (e.g. prove-it-works, fix-root-causes, subtract-before-you-add).
  - 2 agents: `poteto-agent` and `comment-sicko`.
  - Emphasis on runtime verification and multi-model review. The default panel is Opus 5.5, Sol and Grok.
  - Source: https://github.com/cursor/plugins/tree/main/pstack (README, skills/, agents/)
- **Claude Code ports** (both unofficial and MIT, keeping Lauren Tan's copyright):
  - **pstack-claude** (https://github.com/michael-denyer/pstack-claude). "A faithful port for Claude Code, Codex and other agent harnesses". Install with `/plugin marketplace add michael-denyer/pstack-claude` then `/plugin install pstack@pstack-claude`.
  - **open-pstack** (https://github.com/ericlitman/open-pstack). Tracks upstream; `/plugin marketplace add ericlitman/open-pstack`. Full multi-model review needs the Codex and Grok CLIs plus Bun, but the core workflows run with fewer models.
- **Usable by our build agents?** Yes, as a Claude Code plugin. It installs as skills plus a routing hook. Neither port is endorsed by Cursor or Lauren Tan, so pin a release and review the hook before use.
