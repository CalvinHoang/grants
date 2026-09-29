# Stack research — Grant Workbench v1 (Windows, single user)

**Summary**
1. **One language, TypeScript on Node, in Electron.** The UI runs in the Electron renderer. The engine is plain Node code started with `utilityProcess.fork` and connected to the renderer by a `MessagePort`, so no localhost port or secret is needed. I ran this setup end to end locally.
2. **Documents:** pdfjs-dist for PDFs (text plus coordinates), mammoth for DOCX paragraphs and table cells, exceljs to read and write every `.xlsx`, and plain code for MD/TXT. SuperDoc 2.18 **cannot export PDF** (its export type is `'docx'` only). For DOCX→PDF, use Word through COM if Word is installed, then LibreOffice if it is installed. Otherwise PDF export is off.
3. **Storage and secrets:** use the built-in `node:sqlite`. Electron 44 ships Node 24.21 and I confirmed it works inside the utilityProcess. API keys go in Windows Credential Manager through `@napi-rs/keyring`, because keytar is archived.
4. **Graph:** use `@azure/msal-node` as a public client with auth code + PKCE through the system browser and a loopback redirect. Delegated `Files.Read.All`/`Sites.Read.All` do **not** need admin consent, although the tenant's user-consent policy can still block them. Track changes with drive-root `delta`.
5. **Tests:** Playwright `_electron` runs the real app under `xvfb-run` in a Linux container, and I ran it here and it passed. A GitHub `windows-latest` job builds the NSIS installer and runs a smoke test. v1 has no code signing and no auto-update.

Evidence notes: "Local test" means I ran it in this container on 2026-09-27. The scripts are in `scratchpad/stk/` and `research/lab/`. These domains were blocked, so the facts marked *(snippet)* come from search-result text: electronjs.org, v2.tauri.app, electron.build, playwright.dev, learn.microsoft.com, docs.superdoc.dev and docs.github.com. I read the same docs from their GitHub source files wherever I could.

---

## 1. Shell: Electron vs Tauri

| | Electron 44 | Tauri 2 |
|---|---|---|
| Web engine on Windows | Bundled Chromium 152 ([v44.0.0 release](https://github.com/electron/electron/releases/tag/v44.0.0)) | WebView2, which ships with Win10 (Apr 2018+) and Win11 ([tauri-docs windows-installer](https://github.com/tauri-apps/tauri-docs/blob/v2/src/content/docs/distribute/windows-installer.mdx)) |
| SuperDoc / PDF.js | Both need a Chromium-class engine, and both shells provide one | Same |
| Node for the engine | Built in (Node 24.21.0 in Electron 44.4.5, local test) | Needs a separate Node **sidecar** binary compiled with `pkg`, registered in `bundle.externalBin` and allowed in capabilities ([tauri-docs sidecar-nodejs](https://github.com/tauri-apps/tauri-docs/blob/v2/src/content/docs/learn/sidecar-nodejs.mdx)) |
| Languages / toolchains | TS only | TS + Rust + a packaged Node sidecar |
| Installer | electron-builder: `nsis`, `portable`, MSI, AppX ([README](https://github.com/electron-userland/electron-builder/blob/master/README.md)) | NSIS `-setup.exe` or WiX `.msi`; MSI can only be built on Windows ([tauri-docs](https://github.com/tauri-apps/tauri-docs/blob/v2/src/content/docs/distribute/windows-installer.mdx)) |
| Auto-update | electron-updater, NSIS target, providers GitHub/S3/generic HTTP ([auto-update.md](https://github.com/electron-userland/electron-builder/blob/master/website/docs/features/auto-update.md)) | Updater plugin; update signing "cannot be disabled" ([tauri-docs updater](https://github.com/tauri-apps/tauri-docs/blob/v2/src/content/docs/plugin/updater.mdx)) |
| Size | Tens to hundreds of MB, vs single-digit to low double-digit MB for Tauri *(snippet: [pkgpulse](https://www.pkgpulse.com/guides/electron-vs-tauri-2026))* | Smaller, but the Node sidecar adds back roughly a Node runtime *(unverified size)* |
| UI test tooling | Playwright `_electron` (experimental; Electron v12.2.0+/v13.4.0+/v14+) *(snippet: [Playwright class-electron](https://playwright.dev/docs/api/class-electron))*, and it passed in a local test | WebView2 has no first-party Playwright launcher *(unverified)* |

**Choose Electron.** Every document library, the SuperDoc Node SDK, MSAL Node and the provider SDKs are JavaScript. With Tauri we would still ship a Node sidecar, and on top of it we would maintain Rust glue and a second packager. Tauri's size advantage does not matter for a single user.

**Packaging:** use electron-builder with the `nsis` target, since electron-updater supports only NSIS on Windows and not Squirrel.Windows ([auto-update.md](https://github.com/electron-userland/electron-builder/blob/master/website/docs/features/auto-update.md)). Executables and native modules have to live outside ASAR because `child_process.spawn` cannot execute from inside ASAR. electron-builder detects and unpacks them automatically *(snippet: [electron.build contents](https://www.electron.build/docs/contents/))*. That matters for the SuperDoc SDK's CLI binary.

**Code signing and updates:** skip both for v1. electron-builder says you "should sign" apps "shipped to production" ([README](https://github.com/electron-userland/electron-builder/blob/master/README.md)). An unsigned installer will show a SmartScreen "unknown publisher" prompt *(unverified; commonly observed)*, and that is acceptable for Calvin alone. Add electron-updater with a GitHub or generic provider later. Spec §10.3 already lists the update check as a future host.

**Hardening (§10.3):** follow Electron's 20-item checklist ([security.md](https://github.com/electron/electron/blob/main/docs/tutorial/security.md)). The relevant items are context isolation, sandbox, CSP, limiting navigation and new windows, validating IPC senders, serving pages from a custom protocol instead of `file://`, and fuses such as `RunAsNode` off and `EnableEmbeddedAsarIntegrityValidation` on ([fuses.md](https://github.com/electron/electron/blob/main/docs/tutorial/fuses.md)). Turn SuperDoc telemetry off with `telemetry: { enabled: false }`, because it is "Enabled by default" (superdoc@2.18.0 `types/index.d.ts`, local). Serve PDF.js cmaps, standard fonts and wasm from local URLs (`cMapUrl`, `standardFontDataUrl`, `wasmUrl` in [pdf.js api.js](https://github.com/mozilla/pdf.js/blob/master/src/display/api.js)) so no request goes to a CDN.

## 2. Engine: runtime, transport, bundling

- **Language: TypeScript on Node** (Electron's own Node, so there is nothing extra to bundle). Python would mean a second toolchain, a frozen interpreter to ship, and duplicated schemas. SuperDoc has a Python SDK ([repo](https://github.com/superdoc-dev/superdoc)), but nothing here needs Python. Provider SDKs exist on npm: `@anthropic-ai/sdk` 0.128.0 and `openai` 7.23.0 (npm registry, 2026-09-27).
- **Process:** `utilityProcess.fork(engine.js)` is Node's `child_process.fork` equivalent launched through Chromium's Services API. It "can establish a communication channel with a renderer process using MessagePorts" ([utility-process.md](https://github.com/electron/electron/blob/main/docs/api/utility-process.md); *(snippet: [electronjs.org](https://www.electronjs.org/docs/latest/api/utility-process))*). Main creates a `MessageChannelMain`, sends `port1` to the engine and `port2` to the renderer through the preload ([message-ports tutorial](https://github.com/electron/electron/blob/main/docs/tutorial/message-ports.md)).
- **Local test:** I built an Electron 44.4.5 app with a sandboxed, context-isolated renderer and a CSP. The renderer sent a JSON request over the MessagePort, the engine wrote and read `node:sqlite` in WAL mode and replied, and Playwright asserted the result. It passed in 2.3 s under xvfb. Output: `{"result":42,"node":"24.21.0","sqlite":"3.53.4"}`. Code: `scratchpad/stk/el/`.
- **Transport vs §4.2:** a MessagePort satisfies "reachable only from this app" with no open port and no per-launch secret. To keep a later move to the web cheap, define the RPC as JSON `{id, method, params}` plus event messages in the shared schema module (validated with zod or similar), and hide the transport behind a small interface. A WebSocket or HTTP adapter can be added later without touching methods. The engine should also run under plain `node` with a stdio or WebSocket adapter, so CI can test it headless (§7).
- **Blocking work:** SQLite calls and parsing run in the engine process, not in main. Main stays a thin launcher, so the UI never janks.

## 3. Document handling

| Input | Library | Paragraph IDs / locations (§5.4) | Status |
|---|---|---|---|
| PDF | `pdfjs-dist` 6.3.289 (Apache-2.0), `page.getTextContent()` | Each item has `str`, `transform` (x, y), `width`, `height`, `hasEOL` ([api.js TextItem](https://github.com/mozilla/pdf.js/blob/master/src/display/api.js)). Group items into lines, then paragraphs, by y-gap and indent, and store page, ordinal and union bbox. | Local test: 5 CRC-P PDFs (149 pages) extracted in about 2 s in Node. A lab test also rendered a PDF.js TextLayer highlight of a passage correctly (`research/lab/hl12.png`). The paragraph grouping heuristic is our own code and **not yet written**; multi-column layouts are a risk. |
| DOCX (sources) | `mammoth` 1.13.0 (BSD-2), `convertToHtml` | Walk `<p>`/`<li>`/`<td>` in document order, so ordinal = body paragraph index and each table cell counts as a paragraph (§5.4) | Local test: CRC-P sample application (30 pages) gave 462 `<p>` and 219 `<td>` in 0.4 s |
| DOCX (via SuperDoc SDK) | `@superdoc/sdk` 2.15.0 (AGPL-3.0; bundles a `windows-x64` CLI binary, npm) | `blocks.list` returns `ordinal, nodeId, nodeType, textPreview…`, with tables as a single `table` block | Local test: 500 blocks (89 heading, 346 paragraph, 63 listItem, 2 table), open in about 3 s. One run timed out at `host.capabilities` (5 s). The response has previews only, no cell-level rows, and `total`=500 may be a page cap *(unverified)*. **Use it for the form (anchors, `findText`), not for source indexing.** |
| XLSX | `exceljs` 4.4.0 (MIT) | One paragraph per non-empty row: sheet, row number, "Header: value" | Local test: wrote and read back 500 rows in 90 ms |
| MD / TXT | none (split on blank lines / Markdown blocks) | Block index | Trivial |
| Scanned PDF | none | status `no-text` when a page yields under ~20 characters | OCR not required (brief) |

- **Highlighting DOCX passages in the viewer:** locate the passage with SuperDoc `findText` on the stored paragraph text. That call worked in the lab test (`research/lab/sd.mjs`) and removes the need to reconcile mammoth ordinals with SuperDoc's. Whether they line up for tables is *unverified*.
- **Writing the `.xlsx` tables:** use exceljs for both reading and writing, writing to a temp file and renaming it (§5.2). **Do not use the npm `xlsx` package (SheetJS).** npm is stuck at 0.18.5, which is affected by CVE-2023-30533 (prototype pollution). Current builds come only from cdn.sheetjs.com *(snippet: [SheetJS issue #2961](https://git.sheetjs.com/sheetjs/sheetjs/issues/2961), [docs](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/))*. **Risk:** exceljs's last stable release is 4.4.0 from 2023-10-19, with only a prerelease in 2024 (npm `time`). It works, but it is barely maintained.
- **DOCX→PDF export (F-15):**
  - *SuperDoc:* it cannot export PDF. superdoc@2.18.0 declares `export type ExportType = 'docx'` (`dist/superdoc/src/public/export-types.d.ts`, local). A client-side PDF export PR was **closed 2026-09-14**: "Browser PDF export isn't available in the supported package yet, and we haven't committed to an implementation or release date" ([PR #3919](https://github.com/superdoc/docx-editor/pull/3919)).
  - *Word through COM:* `Document.ExportAsFixedFormat` with `wdExportFormatPDF` ([VBA-Docs](https://github.com/MicrosoftDocs/VBA-Docs/blob/main/api/Word.Document.ExportAsFixedFormat.md)). The engine calls it from a short PowerShell script (`New-Object -ComObject Word.Application`) with no native Node module. This gives the best fidelity for a government Word form, but only works if Word is installed. **Ask Calvin; likely, since he uses M365/SharePoint (unverified).**
  - *LibreOffice headless:* `soffice --headless --convert-to pdf --outdir …` works well for typical documents, but "complex Word layouts can shift", missing fonts are substituted, and it needs a timeout because it can hang *(snippet: [converterer cheatsheet](https://github.com/converterer/libreoffice-headless-cheatsheet))*. It is a large install, so detect it rather than bundle it *(size unverified)*.
  - *Electron `webContents.printToPDF`* of SuperDoc's paginated view ([web-contents.md](https://github.com/electron/electron/blob/main/docs/api/web-contents.md)): needs no extra install, but its fidelity is **unverified**. It is worth a WP-3 spike as the fallback.
  - **Recommendation:** Word COM, then LibreOffice if present, then printToPDF (after the spike), otherwise "Export to PDF needs Word". Word export (`.docx`) always works.

## 4. Storage

- **`node:sqlite` (`DatabaseSync`)** is built into Node 24. Its docs mark it "Stability: 1.2 – Release candidate", and the API is synchronous ([node v24 sqlite.md](https://github.com/nodejs/node/blob/v24.x/doc/api/sqlite.md)). A local test inside the Electron 44 utilityProcess worked with SQLite 3.53.4 and WAL. It has **no native module**, so there is no electron-rebuild and cross-building from Linux stays possible.
- Fallback: `better-sqlite3` 13.0.3, a mature library that recommends WAL ([README](https://github.com/WiseLibs/better-sqlite3)). It is a native addon, so it has to be rebuilt for Electron's ABI and blocks building for Windows from Docker/Wine ([multi-platform-build.md](https://github.com/electron-userland/electron-builder/blob/master/website/docs/features/multi-platform-build.md)).
- Keep SQL behind the WP-4 storage module so the two are interchangeable.

## 5. Microsoft Graph from the desktop app

- **Library:** `@azure/msal-node` 7.0.0 (released 2026-09-23, a new major version; pin it). For public clients, `acquireTokenInteractive` "handles both legs of the authorization code flow" and needs only an `openBrowser` callback ([request.md](https://github.com/AzureAD/microsoft-authentication-library-for-js/blob/dev/lib/msal-node/docs/request.md)). The Electron sample uses the system browser with PKCE and a **loopback** listener, and registers a "Mobile and desktop applications" platform with `http://localhost` as redirect URI ([ElectronSystemBrowserTestApp](https://github.com/AzureAD/microsoft-authentication-library-for-js/tree/dev/samples/msal-node-samples/ElectronSystemBrowserTestApp)). Run MSAL in the engine. The engine asks main to call `shell.openExternal` for the sign-in URL.
- **WAM broker (optional, later):** `NativeBrokerPlugin` from `@azure/msal-node-extensions` 5.5.1 is Windows-only. It needs redirect URI `ms-appx-web://Microsoft.AAD.BrokerPlugin/<client-id>` and the window handle from `getNativeWindowHandle()`, which lives in main ([brokering.md](https://github.com/AzureAD/microsoft-authentication-library-for-js/blob/dev/lib/msal-node/docs/brokering.md)). That gives SSO with the Windows account but adds a native dependency and main-process coupling, so skip it in v1.
- **Token cache:** msal-node-extensions persistence encrypts with DPAPI on Windows ([README](https://github.com/AzureAD/microsoft-authentication-library-for-js/blob/dev/extensions/msal-node-extensions/README.md)). Use that rather than Credential Manager for the cache, because the cache is large and Credential Manager caps blob size *(cap unverified)*.
- **App registration:** a single-tenant app in Calvin's tenant, public client, with no secret.
- **Scopes:** `Files.Read.All` delegated has AdminConsentRequired **No**; `Sites.Read.All` delegated also **No** ([permissions reference source](https://github.com/microsoftgraph/microsoft-graph-docs-contrib/blob/main/concepts/permissions-reference.md)). **Caveat:** the tenant's user-consent setting can restrict users to verified publishers or "low impact" permissions, and then an admin must consent anyway ([Entra configure-user-consent](https://github.com/MicrosoftDocs/entra-docs/blob/main/docs/identity/enterprise-apps/configure-user-consent.md)). Check Calvin's tenant.
- **Folder picking:** site search needs `Sites.Read.All`. Listing a drive or its children and downloading content need `Files.Read` at least ([permission includes](https://github.com/microsoftgraph/microsoft-graph-docs-contrib/tree/main/api-reference/v1.0/includes/permissions)). Resolving a **pasted sharing URL** through `/shares/{id}` lists `Files.ReadWrite` as least privileged, so avoid it or accept write scope. For downloads, `/content` returns a 302 to a pre-authenticated URL ([driveitem-get-content](https://github.com/microsoftgraph/microsoft-graph-docs-contrib/blob/main/api-reference/v1.0/api/driveitem-get-content.md)).
- **Change detection:** `GET /drives/{drive-id}/root/delta` pages with `@odata.nextLink` until an `@odata.deltaLink`, which is stored and replayed. `?token=latest` skips the history, deleted items carry a `deleted` facet, and items should be tracked **by id** because `parentReference.path` is empty ([driveitem-delta](https://github.com/microsoftgraph/microsoft-graph-docs-contrib/blob/main/api-reference/v1.0/api/driveitem-delta.md)). The documented endpoints are drive-root. Filter to the linked folder's subtree by item id and parent id. Folder-scoped delta on SharePoint is *unverified*. Poll when the app opens and on demand; webhooks are not needed for one user.
- Use plain `fetch` with the bearer token; the Graph SDK (`@microsoft/microsoft-graph-client` 3.0.7) is optional.

## 6. Windows Credential Manager

- `keytar` was archived on 2022-12-15 ([atom/node-keytar](https://github.com/atom/node-keytar)).
- **`@napi-rs/keyring` 2.1.0** (MIT) is a keytar-compatible binding to Rust `keyring` with the API `new Entry(service, name).setPassword/getPassword/deletePassword` ([keyring-node](https://github.com/Brooooooklyn/keyring-node)). It ships prebuilt `win32-x64/arm64/ia32-msvc` packages (npm), and Node-API is ABI-stable across Node versions ([n-api.md](https://github.com/nodejs/node/blob/v24.x/doc/api/n-api.md)), so it needs no Electron rebuild. Microsoft's vsce and Azure SDK teams have moved to it from keytar ([azure-sdk-for-js #29288](https://github.com/Azure/azure-sdk-for-js/issues/29288), [MSAL #7170](https://github.com/AzureAD/microsoft-authentication-library-for-js/issues/7170)). Loading it inside a utilityProcess on Windows is *unverified*, so test it first in WP-6.
- Electron `safeStorage` uses DPAPI on Windows but is **main process only** and stores ciphertext wherever you put it, not in Credential Manager ([safe-storage.md](https://github.com/electron/electron/blob/main/docs/api/safe-storage.md)). It does not meet §10.3's wording "only in Windows Credential Manager".
- In Linux CI, swap in an in-memory credential provider behind the single-user module (§10.5), because Credential Manager does not exist there.

## 7. Testing and CI: what runs where

| Where | What | Notes |
|---|---|---|
| Linux container (build agents, PR CI) | Lint, types and unit tests; engine integration tests under plain Node, covering ingestion, digest and the loop against LLM stand-ins with fixtures (§11) | The engine is platform-neutral Node |
| Linux container | **Full UI e2e with Playwright `_electron` under `xvfb-run -a`**, with `--no-sandbox` in containers | Local test passed (Electron 44.4.5, Playwright 1.63). Electron needs a display, so use Xvfb *(snippet: [Electron headless CI](https://www.electronjs.org/docs/latest/tutorial/testing-on-headless-ci))*. Screenshots via `page.screenshot` let agents inspect UI states. Windows-only pieces are stubbed: Credential Manager (in-memory), Word COM (skip or LibreOffice), WAM (off). |
| GitHub Actions `windows-latest` | Build the NSIS installer with electron-builder; run a Playwright smoke test on the built app; run the real Credential Manager test and a Word-COM export test where Word exists (runners do not have Office, *unverified*) | Building for Windows from Linux is also possible with the `electronuserland/builder:wine` image when native deps are prebuilt ([multi-platform-build.md](https://github.com/electron-userland/electron-builder/blob/master/website/docs/features/multi-platform-build.md)), but a Windows runner is simpler and tests the real platform. |
| Calvin's PC | Acceptance: the synthetic client run through the UI (§12 integration test); §10.1 timings; SharePoint sign-in against the real tenant | Only place with real Word, WAM and tenant policy |

Two risks: Playwright's Electron support is labelled experimental, and some Electron releases have broken `electron.launch` for a while ([electron#47419](https://github.com/electron/electron/issues/47419)). Pin Electron and Playwright versions together.

---

## Recommended stack

| Piece | Choice | Why | Risk |
|---|---|---|---|
| Shell | Electron 44.x + electron-builder (NSIS) | Chromium for SuperDoc/PDF.js; Node built in; one language; Playwright support | Large installer (fine for one user); keep up with Electron releases (checklist item 16) |
| UI | TypeScript + a web framework (React or Vue, team choice) in a sandboxed renderer served from a custom protocol | Matches SuperDoc/PDF.js; web-portable | None specific |
| DOCX editor | `superdoc` 2.18 (AGPL-3.0), telemetry off | Tested; `findText` anchors | AGPL: a commercial licence is needed if distributed beyond Calvin *(not legal advice)*; bookmarks surviving save and reopen are still unverified (§5.5) |
| PDF viewer + extraction | `pdfjs-dist` 6.3 (viewer, TextLayer highlight, `getTextContent`) | One library for viewing and indexing; fast | Paragraph grouping heuristic is ours; multi-column PDFs |
| Engine | TypeScript on Node 24 inside Electron `utilityProcess` | No bundling of a second runtime; process isolation; also runs under plain Node for CI | utilityProcess starts only after `app.ready` (minor) |
| UI↔engine | MessagePort with JSON RPC and events; shared zod schemas | No open port or secret; transport-swappable for the web later | Custom small RPC layer to write (WP-0) |
| DOCX sources | `mammoth` | Paragraphs and table cells in order; 0.4 s for 30 pages | HTML-oriented; exotic content (text boxes, footnotes) is *unverified* |
| XLSX read/write | `exceljs` 4.4 | One library for reading sources and writing both tables | Slow maintenance; avoid npm `xlsx` (CVE) |
| MD/TXT | built-in code | Trivial | — |
| DOCX→PDF | Word COM via PowerShell, then LibreOffice if installed, then `printToPDF` (after spike) | SuperDoc has no PDF export | Word presence on Calvin's PC unconfirmed; printToPDF fidelity unknown |
| Database | `node:sqlite` (WAL) | Built in, no native build; tested in Electron 44 | Release-candidate API; fallback is better-sqlite3 |
| Secrets | `@napi-rs/keyring` → Windows Credential Manager | Maintained keytar replacement, prebuilt N-API | Loading in utilityProcess on Windows is untested |
| Graph auth | `@azure/msal-node` public client, auth code + PKCE, system browser + loopback; DPAPI token cache via msal-node-extensions | Documented Electron pattern; no broker needed | Tenant consent policy may still need admin; MSAL 7.0 is new, so pin it |
| Graph sync | `fetch` + drive-root `delta`, filtered to the linked folder by id | Documented; cheap polling | Folder-scoped delta *unverified*; `/shares` needs a write scope |
| Tests | Vitest (unit), Playwright `_electron` under xvfb (Linux e2e), `windows-latest` smoke and build | Agents verify real UI in Linux; Windows-only parts tested on Windows | Playwright Electron support is "experimental" |
| Signing / updates | None in v1; add electron-updater (NSIS, GitHub or generic) later | Single user | SmartScreen prompt on install |
