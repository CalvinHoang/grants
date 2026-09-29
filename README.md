# CRC-P

Grant Workbench: a Windows desktop tool for grant advisors, starting with CRC-P (Cooperative Research Centres Projects, Round 19).

Build agents: start with `CLAUDE.md`.

## Contents
- `docs/spec/05-build-spec.md`: the build spec (source of truth; wins over 01–04).
- `docs/spec/01-drafting-workflow-spec.md`: the drafting workflow (digest, draft, review, assess, decide).
- `docs/spec/02-jev-question-list.md`: every question put to the decision model.
- `docs/spec/03-ux-spec.md`: front end and UX.
- `docs/spec/04-backend-spec.md`: backend decisions (document editor, grant library).
- `docs/research/`: jev, model APIs and desktop stack research.
- `reference/crc-p/`: the CRC-P Round 19 reference pack and government originals.
- `design/mockup/`: source of the clickable mockup.

## Code
| Path | What it is |
|---|---|
| `packages/shared` | Schemas both sides import: the UI ↔ engine methods and events (§4.2), data types (§5), the decision-model (§8) and language-model (§9.1) contracts, `models.json` (§9.2), and the RPC client/server that validates every payload |
| `packages/engine` | The workflow engine. Runs in an Electron `utilityProcess`, or under plain Node in tests |
| `apps/desktop` | Electron shell (`src/main`), preload (`src/preload`) and the React UI (`src/renderer`); Playwright tests in `e2e/` |
| `scripts/check-model-ids.mjs` | CI check: no model ID outside a `models.json` |

Node 24 (22.12+ works). Commands from the repo root:

```sh
npm ci
npm run lint && npm run typecheck && npm test && npm run check:model-ids
npm run build                  # renderer (Vite) + main, preload and engine (esbuild) into apps/desktop/dist
npm start                      # build and launch the app
xvfb-run -a -s "-screen 0 1920x1080x24" npm run e2e   # Playwright _electron smoke test (Linux container)
npm run dist:win               # NSIS installer into apps/desktop/release (on Windows)
```

Workspace packages export their TypeScript source (`exports` points at `src/*.ts`, imports without extensions). Vite, esbuild and Vitest handle that; plain `node` does not, so scripts that import them run under Vitest or `tsx`, or bundle first.

The UI and engine talk only over a MessagePort that the main process hands to each side. Add a request by declaring it in `packages/shared/src/rpc.ts` and a handler in the engine; the engine answers `not_implemented` for declared methods it doesn't handle yet.
