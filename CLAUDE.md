# Grant Workbench — instructions for build agents

Grant Workbench is a Windows desktop app for a grant advisor. The advisor loads a client's documents, and the app drafts the government application form (first grant: CRC-P Round 19), scores each answer against the grant's criteria, and flags what's weak or missing.

## Start here
1. Read `docs/spec/05-build-spec.md` §0–§5. It is the source of truth. Where specs 01–04 disagree with it, 05 wins.
2. Find your work package in §12 and its GitHub issue (#3–#15, label `work-package`). Read the issue's comments too: changes after the spec was written are posted there. Read the sections it references, then build it.
3. Look things up in `docs/research/` (jev, model APIs, desktop stack) and `reference/crc-p/` (the grant). Don't invent API details. Where something is unknown, build behind the interface in 05 §8/§9 and stub it.

## Repo map
| Path | What it is |
|---|---|
| `docs/spec/05-build-spec.md` | Build spec: decisions, features and acceptance criteria, agentic loop, interfaces, stack, NFRs, work packages |
| `docs/spec/01–04` | Earlier design specs: workflow, decision-model questions, UX, backend decisions |
| `docs/research/` | Research behind the stack, the jev adapter and the model adapters |
| `reference/crc-p/` | CRC-P Round 19 reference pack: requirement breakdowns (`01`–`08`), `criteria.json`, government originals in `source/` with text extractions in `source/text/`. WP-12 builds the grant package from this |
| `design/mockup/` | Source of the clickable UI mockup (https://claude.ai/artifact/YJrJJ1pajKchrLhPTmRTto) |

## Rules
- **Prove it in the running app.** A package is done when its acceptance checks pass and you've exercised it in the running build (Playwright `_electron` under `xvfb-run` in a Linux container; Windows-only parts stubbed). Unit tests alone don't count.
- **One PR per work package.** Before / After / How description, the acceptance checks that pass, and measured numbers where 05 §10 applies. Never merge your own PR; Calvin merges.
- **No model names in code or prompts.** Call model roles (`drafter`, `worker`, `extractor`, `decider`, `chat`); `models.json` maps roles to providers and models (05 §9.2). CI fails on a model ID outside `models.json`.
- **Never invent content.** Drafts cite passages by ID; passage text is always copied by code from the paragraph index, never written by a model. Missing information becomes a red placeholder. Declarations are never filled or suggested.
- **Advisor edits never trigger a run.** Only Run and Draft/Redraft start model calls.
- **Client data:** no client content in logs, telemetry or test fixtures (use the synthetic client, 05 §11). Keys live in Windows Credential Manager, never in files. SuperDoc telemetry off. Outbound calls only to configured model providers, jev and Microsoft Graph.
- Keep the UI clean: no explanatory hint text on screen (spec 03 §5).
