# Grant Workbench v1 — build specification (handoff)

Status: v0.2 draft (stack, jev and model research folded in; models as roles) · 2026-09-27 · Written for coding agents building v1 in `github.com/CalvinHoang/CRC-P`. Companion to specs 01 (workflow), 02 (decision-model questions), 03 (UX), 04 (backend decisions).

Where this file and specs 01–04 disagree, **this file wins**; it records Calvin's later decisions (10:13–10:41 on 2026-09-27). Items marked **Proposed** are Claude's defaults that Calvin hasn't confirmed; build them as written unless told otherwise.

---

## 0. How build agents use this document

- Each work package (§12) is self-contained: goal, inputs, interfaces, acceptance checks. Read §1–§5 first, then your package, then the sections it references.
- **Prove it in the running app.** A package is done only when its acceptance checks pass *and* you have exercised the feature in the running Windows build (screenshot or recorded check), not just unit tests. This follows the discipline of Lauren Tan's pstack (plan → task list → runtime verification). pstack itself is a Cursor plugin (MIT); build agents on Claude Code may use a community port (`michael-denyer/pstack-claude` or `ericlitman/open-pstack`, both MIT, unofficial), pinned to a release after its hooks are reviewed. Optional: the rules in this document are what's binding.
- Every acceptance check is written to be automated where possible. Where it can't be (visual quality), the check names what to compare against (the mockup, spec 03 §5).
- Open a PR per package for Calvin to merge. **Never merge your own PR.** PR description: Before / After / How (see repo conventions).
- Never invent API details for jev, GPT-6 Astra or Microsoft Graph. Use `docs/research/` findings; where a detail is unknown, build behind the interface in §8/§9 and stub it.
- Client data rules (§10.3) apply to every package, including tests and logs.

## 1. Product in one paragraph

A Windows desktop app for one grant advisor (Calvin). For each client application it keeps the grant's documents, the client's source documents and the government application form in one window. An agentic workflow reads the sources, drafts every form field to win the grant, scores each answer with a decision model, and says what's missing. The advisor edits the form directly, chats with the AI about any item, asks for redrafts, and exports a clean Word or PDF copy to paste into the government portal. First grant: CRC-P Round 19. Built so more grants, and later more advisors, can be added without a rewrite.

### 1.1 In scope for v1
Everything in specs 01–04 as amended here: grant library, applications, source documents (upload, drag-drop, SharePoint link), references and templates, indexing and digest, requirements and digest tables, the form editor with colour coding, the full drafting loop, overall scores and issues, item detail with evidence, chat with Draft/Redraft, advisor edits, declarations filled by the advisor, consistency check, export, settings.

### 1.2 Out of scope for v1
Budget and Financial Workbook drafting (form sections F.2 and H: shown in the form, left for the advisor). The RFI workflow (v1 only flags "Information needed"). Filling the government portal. PDF editing (view only). Multiple users, logins, a shared grant library, installers for other people, macOS. OCR of scanned PDFs (**Proposed**: detected and flagged "no readable text", not processed). Audio and video sources.

## 2. Decisions register

| # | Decision | Source |
|---|---|---|
| D1 | Desktop app, Windows only, single user (Calvin); keep seams to add users later | Calvin 06:07, 10:18 |
| D2 | No login; one Microsoft sign-in only to link SharePoint | 06:07 |
| D3 | Client data may be sent to model providers anywhere, under their no-training terms | 10:18 |
| D4 | Build everything in one go, split into parallel work packages | 10:18 |
| D5 | Test data: a synthetic client built by us | 10:18 |
| D6 | Word editor: SuperDoc, telemetry off. PDF: PDF.js, view only | 10:00, 10:41 |
| D7 | Grant library: each grant's form, guidance and predefined requirements table stored; copied into each new application folder | 10:09 |
| D8 | "Decision model" is swappable: jev first, an LLM can stand in | 10:20 |
| D9 | Threshold 0.99, set per decision model | 05:32, 10:20 |
| D10 | Model picks the closest reference application | 10:23 |
| D11 | Cross-field consistency check after drafting; conflicts flagged | 10:23 |
| D12 | Max 5 passes per field; one pass by default; redraft only on a concrete gap; stop when a pass gains little | 10:23, 10:35 |
| D13 | Chat answers and suggests only; changes happen through Draft/Redraft; chat feeds the next redraft; facts stated in chat become Advisor note rows | 10:23, 10:41 |
| D14 | Export Word or PDF only; no portal filling | 10:23 |
| D15 | Digest runs when documents are added; drafting only when the advisor presses Run | 10:35 |
| D16 | Explanations ("weak / fix") generated only when an item is opened | 10:35 |
| D17 | Each field starts as soon as its passages are ready; prompt caching on | 10:35 |
| D18 | Each field appears when it is final | 10:41 |
| D19 | Performance and cost targets (§10.1) | 10:38 |
| D20 | Model per task (§9.2) | 10:39 |
| D26 | No model is named in code or prompts: the workflow calls **model roles**; one config file maps each role to a provider and model (§9.2) | 10:46 |
| D21 | Editing the requirements or digest table after drafting labels affected fields "Inputs changed"; no automatic redraft | 10:41 |
| D22 | Declarations and yes/no disclosures: left blank and flagged; the advisor fills them; the app never suggests | 10:41 |
| D23 | Build agents open PRs; Calvin merges | 10:41 |
| D24 | Manual edits change only text; nothing reruns | 05:21 |
| D25 | Red placeholder instead of invented content | 06:12 |

## 3. Glossary

| Term | Meaning |
|---|---|
| Grant package | One grant round's stored material: documents, form template, form map, requirements table, decision-model questions (§5.1) |
| Application | One client's application for one grant round, with its own folder (§5.2) |
| Field | One answer in the government form, ID like `AF-I.4` (reference pack `04-application-form-map.md`) |
| Field kind | `narrative` (drafted), `data` (filled from sources), `confirm` (advisor fills), `budget` (out of scope), `rule` (checked by code) |
| Requirement row | One granular piece of guideline wording, ID like `MC-4a.2` or `EL-11.3` (spec 02) |
| Source document | A client file (PDF, DOCX, XLSX, MD, TXT), linked from SharePoint or local |
| Paragraph | The unit of the paragraph index: one paragraph of text with a stable ID and location (§5.4) |
| Passage | One or more consecutive paragraphs linked to one or more requirement rows; the digest table row |
| Advisor note | A passage whose source is the advisor (typed in chat or added in the digest table) |
| Pass | One draft → review → assess → decide cycle for a field |
| Decision model | Answers typed questions (probability / choice / rubric score) with a confidence (§8). jev or an LLM stand-in |
| Model role | A named job the workflow asks a model to do (`drafter`, `worker`, `extractor`, `decider`, `chat`). Code and prompts refer only to roles; `models.json` says which model fills each role (§9.2) |
| Drafting model | Whatever model fills the `drafter` role (§9) |
| Gap type | Decision model's reason a row is below threshold (spec 02 §D) |
| Flag | An item shown under Issues: below threshold, information needed, conflict, advisor decision, out of space, declaration to fill |
| Placeholder | Red text in the form instead of a drafted claim: `[Information needed: <what> — <row IDs>]` |
| Fingerprint | Hash of everything a field's draft depends on; unchanged fingerprint = skip on re-run (§7.8) |

## 4. Architecture

```
┌──────────────────────── Windows desktop app ────────────────────────┐
│  UI (renderer)                          Engine (separate process)   │
│  - layout, drawer, panels               - ingestion & paragraph index│
│  - SuperDoc form editor                 - digest                     │
│  - PDF.js / sheet / markdown viewers    - drafting loop (§7)         │
│  - tables, right panel, chat            - export                     │
│            │  local RPC (§4.2)  ▲        - provider adapters (§8, §9)│
│            └────────────────────┘        - SharePoint sync           │
│                     │                               │                │
│             Application folders + SQLite (§5)       │                │
└─────────────────────────────────────────────────────┼────────────────┘
                                                      ▼
                         Anthropic API · OpenAI API · jev API · Microsoft Graph
```

### 4.1 Stack — **Proposed** (from `docs/research/stack.md`; Windows only, single user)
One language throughout: **TypeScript**. A minimal Electron + engine + Playwright skeleton was run end to end during research.

| Piece | Choice | Why | Risk / check |
|---|---|---|---|
| Shell | Electron (current stable, 44 at time of research); installer by electron-builder (NSIS) | Bundles Chromium, so SuperDoc and PDF.js behave as tested; the engine runs on Electron's own Node, one runtime to ship. Tauri would still need a separately packaged Node engine | No code signing or auto-update in v1 (single user); Windows SmartScreen will warn on install (unverified). electron-updater can be added later |
| Engine process | Plain Node started with Electron `utilityProcess`; talks to the UI over a MessagePort | No localhost port or secret; the same engine code runs under plain Node in CI; transport swappable for WebSocket when moving to web | — |
| Word editor | SuperDoc (Agreed 10:41), telemetry `enabled:false` | Tested on the CRC-P form | `blocks.list` returns previews and tables as one block: use it for form anchors only, not for indexing sources. Saw one 5 s SDK timeout: WP-3 adds retry and measures |
| PDF viewer | PDF.js (`pdfjs-dist`) | Also gives text with coordinates for the paragraph index | Line-to-paragraph grouping is our code (WP-4) |
| DOCX sources | mammoth | Paragraphs and table cells in document order | — |
| XLSX | exceljs, read and write | Reads source spreadsheets; writes the requirements and digest tables | No stable release since 2023-10; don't use npm `xlsx` 0.18.5 (known CVE) |
| MD / TXT | Plain code | — | — |
| Storage | `node:sqlite`, WAL mode | Built in, no native build; tested in the engine process | better-sqlite3 is the fallback |
| Secrets | `@napi-rs/keyring` (Windows Credential Manager) | keytar is archived; Electron `safeStorage` doesn't use Credential Manager | Loading inside the engine process on Windows unverified: WP-6 checks first |
| Microsoft sign-in | `@azure/msal-node` (pin the version; 7.0 released 2026-09-23), public client, auth code + PKCE, system browser, `http://localhost` redirect; token cache encrypted with DPAPI (msal-node-extensions) | Standard for desktop apps; Windows account sign-in (WAM) can come later | Tenant policy may still require admin consent |
| SharePoint | Delegated `Files.Read.All` and `Sites.Read.All` only; change detection by polling drive `delta` and filtering to the linked folder | Read-only | Resolving a pasted *sharing* link via `/shares` needs write scope, so the + action accepts a folder URL, resolved from its site and path, or a folder picker that browses sites (**Proposed**). Folder-scoped delta on SharePoint unverified |
| DOCX → PDF export | The engine saves the clean DOCX, then has Microsoft Word on the PC convert it to PDF in the background (COM automation via PowerShell; Word stays hidden) | SuperDoc saves DOCX only; Word gives the same layout the government form has in Word. Calvin has Word (11:26) | Other users without Word later: LibreOffice as a fallback (a later seam, not built in v1) |
| Tests | Vitest for units; Playwright `_electron` under `xvfb-run` in the Linux container for the full UI, Windows-only parts stubbed; a GitHub `windows-latest` job builds the installer and runs a smoke test | Build agents can verify the running app in their own container (§0) | Final acceptance on Calvin's PC |

### 4.2 UI ↔ engine contract
- The engine is a separate OS process started by the shell (`utilityProcess`), reachable only from this app over a MessagePort (§4.1). The UI never calls model providers directly.
- Requests: `project.*`, `documents.*`, `digest.*`, `run.*`, `field.*`, `chat.*`, `export.*`, `settings.*`. Events streamed to the UI: `progress`, `field.final`, `flag.changed`, `digest.updated`, `document.indexed`, `usage.updated`, `error`.
- The exact method list and payload schemas live in one shared schema module (WP-0) that both sides import. Every payload is validated on receipt.
- The engine owns all writes to application folders and SQLite, except the form DOCX, which the UI's SuperDoc instance saves (the engine inserts field text through the UI via `field.final`, so the advisor's open document is never overwritten behind SuperDoc's back).

## 5. Data and files

### 5.1 Grant package (read-only, ships with the app)
```
<app data>/grants/crcp-r19/
  manifest.json            id, name ("CRC-P Round 19"), grant ("CRC-P"), round, version, opened/closed dates
  documents/               guidelines.pdf, application-form.docx, application-form.pdf, sample-grant-agreement.pdf,
                           partners-agreement-template.docx, financial-workbook.xlsx, program-faq.pdf
  requirements-table.xlsx  columns exactly as spec 01 §4b: ID · Exact guideline wording · Deliverable · Form field · Items from client
  form-map.json            per field: id, label, question text (verbatim), kind, char limit, anchor (§5.5), rows it answers, shared-box group
  questions.json           decision-model questions per row (spec 02 §A–§G): template, state recipe, type, options
  rules.json               code-checked eligibility rules (spec 02 §B.2) as data, e.g. {"id":"EL-10","field":"AF-G.8","check":"duration_months <= 36"}
```
- Source for CRC-P: `reference/crc-p/` (form map, criteria.json, verbatim guideline text) and spec 02. WP-12 builds this package.
- A grant appears under New application once its package exists. Packages are versioned; an application records the package version it was copied from and keeps it.

### 5.2 Application folder
```
Documents\Grant Workbench\<Client> – <Grant round>\
  Grant documents\            copied from the package on creation
  Workflow\                   requirements-table.xlsx (copied), digest-table.xlsx (generated)
  Deliverables\               R&D application.docx (working copy of the form)
  Sources\                    uploaded and dragged-in files
  References and templates\   reference applications and templates
  .workbench\                 workbench.db (SQLite), sharepoint-links.json, cache\
```
- Linked SharePoint documents are **not** copied into `Sources\`; they're cached read-only in `.workbench\cache\` for indexing and viewing, and listed under "Linked · SharePoint".
- The two `.xlsx` tables are the source of truth for their contents; the engine rereads them when they change on disk and writes them atomically (write temp, then rename).

### 5.3 SQLite (`workbench.db`) — **Proposed** schema, owned by WP-4
| Table | Holds |
|---|---|
| documents | id (`D001`…), path or SharePoint item id, origin (local / sharepoint / reference / grant), sha256, type (DG-1), party (DG-3), pages, status (indexed / no-text / error), added_at |
| paragraphs | id (`D003-0142`), document_id, ordinal, page, sheet/row for spreadsheets, char offsets, text, bbox (PDF) |
| passages | id (`P-014`), paragraph span, origin (digest / advisor-note / advisor-added), created_at |
| passage_links | passage_id, row_id, p_supports, status (confirmed / suggested / advisor-added / rejected) |
| fields | field_id, state (§7.2), pass_count, fingerprint, final_text_ref, edited_since_assessed, inputs_changed |
| sentences | field_id, ordinal, text, passage_ids, row_ids, connective flag |
| scores | field_id / row_id / overall id, question id, model id, probability or choice, confidence, pass, created_at |
| flags | id, kind, row_ids, field_ids, message fields (spec 01 §7), status (open / resolved by advisor) |
| chat | item id, role, text, created_at, used_in_redraft_id |
| runs, calls | run id, trigger (run / redraft / digest / consistency), status; per provider call: task, model, tokens in/out/cached, cost, latency, request id (no content) |

### 5.4 Paragraph IDs and locations
- IDs are stable for a given file hash: `D<doc>-<ordinal>`. Re-importing an identical file (same sha256) reuses its paragraphs (dedupe, §7.1).
- PDF: page number, reading-order ordinal, text, bounding box for highlight in PDF.js. DOCX: body paragraph index, table cells as paragraphs. XLSX: one paragraph per non-empty row (sheet, row number, "Header: value" pairs). MD/TXT: block index.
- **Verbatim rule:** passage text shown anywhere is always copied by code from `paragraphs.text`; no model ever writes quoted source text.

### 5.5 Form anchors and answer boxes
- `form-map.json` gives each field an anchor: the question's block in the government DOCX, found by exact text (SuperDoc `doc.blocks.findText` worked in the test) plus its ordinal, as fallback.
- The answer box is a paragraph range inserted after the anchor and wrapped in a bookmark named `GW_<fieldId>` so it can be found and replaced. **Proposed**; WP-3 must verify SuperDoc keeps bookmarks through save and reopen, and if not, choose another stable wrapper (content control) and record why.
- Colour marks inside the working DOCX: yellow = Word highlight on sentences linked to rows below threshold; red = red text for placeholders. Export removes both (§6 F-15).

## 6. Features and acceptance criteria

Format: behaviour, then acceptance checks (AC). "Synthetic client" = the fixture in §11.

### F-01 Window, layout and look
Behaviour: spec 03 §2 and §5 and the mockup (`design/mockup/`, published at https://claude.ai/artifact/YJrJJ1pajKchrLhPTmRTto): top bar (menu button, application name), menu drawer (Applications, New application, Export as Word/PDF, Settings), left tree (five headings in order, default open/closed states), centre, right panel. Both side panels collapse from icons inside them, slide ~200 ms, reopen from edge icons, and are resizable (min 220 px, max 480 px, width remembered).
- AC1 Launch to a usable window in ≤ 3 s on a typical Windows 11 laptop with an application open.
- AC2 Collapse and reopen each panel 20 times: no layout jump, the centre fills the space, nothing disappears (the bug Calvin hit at 06:52).
- AC3 Screenshot of the main view at 1440×900 matches the mockup's layout, spacing and colours (reviewed against spec 03 §5 wording rules: no helper text, no status chatter).
- AC4 All controls reachable by keyboard with a visible focus ring.

### F-02 Grant library and new application
Behaviour: spec 04 §10. New application: pick grant round, type client name → folder created, grant documents and requirements table copied, empty form DOCX copied, tree shows it. Applications list in the drawer; switching applications keeps each one's state.
- AC1 Creating "Harbour Robotics – CRC-P Round 19" produces exactly the §5.2 layout with the package files byte-identical to the package.
- AC2 Editing the application's requirements table never changes the package copy.
- AC3 Reopening the app restores the last open application, panel widths and open tree sections.

### F-03 Source documents
Behaviour: spec 03 §2. "+" offers SharePoint folder URL or Upload files; drag-and-drop anywhere copies files into `Sources\`; tree nests "Linked · SharePoint" (with folder path) and "Local · this application"; clicking opens the document in the centre in its own format (PDF.js; DOCX read-only in SuperDoc; XLSX as a sheet; MD rendered). Duplicate files (same sha256) are listed once.
- AC1 Dropping 10 mixed files adds them under Local within 2 s (indexing continues in the background, F-05).
- AC2 Linking a SharePoint folder lists its files; a file added in SharePoint appears after sync (on open and every 10 minutes while open, **Proposed**).
- AC3 Opening an evidence link (F-11) opens the source at the right page and highlights the passage.
- AC4 A scanned PDF shows "No readable text" on its tree item and is excluded from digest.

### F-04 References and templates
Behaviour: last tree heading, same "+" as sources. Reference applications here are candidates for the drafting style (D10); templates are for the advisor only.
- AC1 Adding two reference applications: the run log records which one the decision model picked for each narrative field and why (choice + confidence).

### F-05 Indexing and digest on upload
Behaviour: §7.1. Runs automatically when documents are added or change; never drafts. A quiet progress line shows while it runs.
- AC1 Synthetic client (≈200 pages): digest completes in ≤ 60 s and ≤ US$1.
- AC2 Every passage's text equals the concatenated source paragraphs exactly (automated check over all passages).
- AC3 Against the synthetic client's answer key (§11): ≥ 90% of expected passage-to-row links are confirmed or suggested; the planted information gaps have no confirmed passages.

### F-06 Requirements table
Behaviour: opens in the centre as an editable table with exactly the five columns (spec 01 §4b). Edits save to the application's `.xlsx`. After drafting, editing a row labels the fields it feeds "Inputs changed" (D21).
- AC1 Add, edit and delete a row; reopen; changes persist; the package copy is unchanged.
- AC2 Editing MC-4a.3 after a run labels AF-I.4 "Inputs changed" and triggers no model call (checked in the calls table).

### F-07 Digest table
Behaviour: spec 01 §5.1 columns. Advisor can add a passage (select text in a source viewer → "Add to digest"), retag rows, reject, and add an Advisor note. Suggested links (0.5–0.99) are shown distinctly and can be confirmed or rejected. Removing a cited passage marks citing sentences "unsupported" (no redraft).
- AC1 Every row shows document, location, party, exact passage, rows, P(supports), status, used in.
- AC2 Rejecting a passage cited in AF-I.4 marks those sentences unsupported and labels AF-I.4 "Inputs changed"; no model call.

### F-08 The form
Behaviour: spec 03 §3. The government DOCX opens in SuperDoc, exactly as published (watermark kept, D per 07:06). Answer boxes under each question (§5.5); live character count against the limit on narrative fields; yellow sentence highlight and red placeholders; clicking coloured text selects that item in the right panel. Budget fields (F.2, H) show "Out of scope" and are not drafted.
- AC1 All 30 pages render; every field in `form-map.json` has an answer box at the right place (automated: anchor found for 100% of fields).
- AC2 Character counts match the portal's counting (characters including spaces) on a test string set.
- AC3 Save, close, reopen: text, colours and answer-box wrappers survive; the file opens in Microsoft Word without repair prompts.

### F-09 Run
Behaviour: §7.2–§7.7. "Run" (verb-first button, placement per mockup; **Proposed**: in the right panel summary above Overall when no run has happened, and in the drawer) starts drafting all in-scope fields. Progress: one line at the top of the right panel summary ("34 of 60 fields done"). Fields appear as each becomes final (D18). The advisor can keep working and editing final fields; Cancel stops cleanly.
- AC1 Synthetic client: first fields appear ≤ 60 s after Run; all fields final ≤ 3 min; cost ≤ US$8 with the starting `models.json` (from the calls table).
- AC2 Re-run with no changes: ≤ 1 min, ≤ US$1, no narrative field redrafted (fingerprints unchanged).
- AC3 Kill the app mid-run; relaunch; the run resumes from the last completed step without redoing finished fields.
- AC4 No sentence in any narrative field lacks a passage citation unless it is marked connective; every placeholder names at least one row ID (automated).
- AC5 Zero invented facts on the synthetic client: every number, date, name and claim in the drafts traces to a passage (automated check of numbers/dates/names against cited passages, plus a manual review of a 20-sentence sample recorded in the PR).

### F-10 Right panel: summary and jump
Behaviour: spec 03 §2. Nothing selected: Overall (Compelling %, Eligible %, each with thin bar and the question), then Issues (questions below threshold with %, "Information needed" items, conflicts, out of space, declarations to fill). Clicking an issue opens the draft if needed, smooth-scrolls to the answer box and outlines it; the panel switches to detail.
- AC1 Issues list exactly matches open flags in SQLite.
- AC2 Clicking each issue lands on the correct answer box (automated over all flags in the synthetic run).

### F-11 Right panel: item detail
Behaviour: question put to the decision model, percentage, "Weak:" and "Fix:" one sentence each (generated on first open, D16, cached until the field changes), evidence list (exact quote + source link), "Edited since assessed" / "Inputs changed" labels where they apply.
- AC1 First open of an item shows weak/fix within 5 s; second open is instant with no model call.

### F-12 Chat and Draft/Redraft
Behaviour: spec 03 §2 composer: context chip, text box, attach, model selector, Draft/Redraft button, Send. Send chats only (D13). Redraft on the selected item uses: the item's chat since its last draft + typed text as guidance. Facts the advisor states are extracted into Advisor note passages (shown in the digest table, citable, deletable). Label: "Draft" when the field is a placeholder, "Redraft", or "Redraft all" when nothing is selected.
- AC1 Chat "They have 42 staff, not 38" then Redraft on AF-E.1-related text: an Advisor note passage exists, the new draft cites it, and the old figure is gone.
- AC2 Sending chat messages alone never changes the form (automated diff).
- AC3 Single-field redraft: text appears ≤ 60 s, ≤ US$0.25.

### F-13 Advisor edits
Behaviour: D24. Typing in the form changes only text. Edited fields get "Edited since assessed" until re-assessed on request. The agent never overwrites advisor text except on Redraft of that field.
- AC1 Edit 10 fields: zero model calls recorded.

### F-14 Declarations and disclosures
Behaviour: D22. `confirm`-kind fields (form map) are left blank, listed under Issues as "To fill", and filled by the advisor (Yes/No or text). Never pre-filled, never scored.
- AC1 After a run, every `confirm` field is blank and listed; filling one removes it from Issues.

### F-15 Export
Behaviour: drawer → Export as Word / Export as PDF. Clean copy: highlights and red colour removed; placeholders kept as plain text; watermark and layout as in the government file.
- AC1 Exported DOCX has no highlight or red-coloured runs (automated XML check) and opens in Word without repair.
- AC2 Exported PDF matches the DOCX page count ±1 and contains every drafted field.

### F-16 Settings
Behaviour: drawer → Settings: Microsoft account (sign in/out), API key per provider stored in Windows Credential Manager, the model for each role (§9.2, written to `models.json`), the `decider` threshold, usage and cost to date.
- AC1 Keys never appear in files, logs or SQLite (automated grep of the app data folder after a run).
- AC2 Switching the decision model from jev to the LLM stand-in needs no restart and uses that model's threshold.
- AC3 Changing any role's model in Settings takes effect on the next call with no restart, and the calls table records the new model.
- AC4 No model ID or provider price appears in source or prompt files outside the shipped `models.json` (automated grep in CI).

### F-17 Consistency check
Behaviour: §7.6, after all fields are final. Conflicts become flags naming both fields and both statements; no text changes.
- AC1 Synthetic client's planted conflicts (§11) are all flagged; no flag on the planted consistent facts.

## 7. The agentic workflow — build detail

### 7.1 Ingest and digest (on document add or change)
1. **Hash and dedupe**: sha256; identical file → reuse its document record.
2. **Extract paragraphs** (§5.4) by code. PDF with no text layer → status `no-text`, stop.
3. **Classify** (`decider` role, asked as ordinary choice and yes/no questions: spec 02 DG-1 type, DG-3 party, DG-2 "is this a bundle of several documents"). State: first ~28K tokens. jev has no classify or split endpoint, so a bundle is split by code at page/heading boundaries, with the `worker` role proposing split points only when code can't.
4. **Find candidates** (`worker` role): per document (or ≤150K-token chunk), input = numbered paragraphs + the full requirements table (+ data-field list); output JSON `[{row_id | field_id, paragraph_ids:[...], span_note}]`. No quoted text in the output.
5. **Build passages**: contiguous paragraph spans per row; merge overlaps.
6. **Confirm links** (decision model DG-4, parallel): ≥ threshold → confirmed; 0.5–threshold → suggested; below 0.5 → dropped.
7. **Data fields**: code extractors first (ABN with checksum, dates, currency, headcount, TRL); leftovers via the `extractor` role returning paragraph IDs + value; values must appear verbatim in the cited paragraph or they're discarded.
8. Write `digest-table.xlsx` and SQLite; emit `digest.updated`. Fields whose passages changed get "Inputs changed" if already drafted.

### 7.2 Field state machine (Run)
```
queued → waiting_for_passages → drafting → reviewing → assessing → deciding
      → (redraft: drafting)  |  final  |  final_with_flags  |  failed(retryable)
```
- A field starts when every requirement row it answers has finished step 6 (D17).
- `data` fields: filled from §7.1 step 7, rule-checked (rules.json), → final. Missing value → placeholder + Information needed flag.
- `confirm` fields: → final immediately, blank, flag "To fill" (D22).
- `budget` fields: skipped.
- `narrative` fields: §7.3–§7.5.

### 7.3 Draft (`drafter` role)
Input, assembled by code in this order (stable prefix first, for caching): system rules (win the grant; plain text; within limit; cite every factual sentence; placeholder rule; style rules from spec 01 §2b) → grant context (criterion heading, points, general guidance) → the reference answer for this field if a reference was picked (D10) → field question verbatim, char limit, rows with verbatim wording and points → confirmed passages and advisor notes (ID + exact text) → on a redraft: rows below threshold, unused passages per row, and advisor guidance (chat + typed text).

Output (structured): `{sentences:[{text, passage_ids[], row_ids[], connective:boolean}], placeholders:[{row_ids[], missing}]}`.

Code checks, with one automatic retry on failure: length ≤ limit (portal counting); every non-connective sentence has ≥1 valid passage ID; every row answered or placeholdered; no quoted source text longer than 12 words unless copied from a cited paragraph.

### 7.4 Review (`worker` role)
One editing pass for redundancy (including against other fields feeding the same criterion, given as read-only context), flow and padding. Same structured I/O. Code check: the set of cited passage IDs is unchanged, placeholders unchanged, length ≤ limit; otherwise keep the pre-review draft and log it.

### 7.5 Assess and decide (decision model)
- Per row the field answers: P(compelling) (spec 02 §A) or P(eligible) (§B.1). State assembled by the recipe in `questions.json`, capped at the `decider` role's state limit (from `models.json`; jev: state plus the longest question ≤ 32K tokens, so budget 28K) with this truncation order: other fields in state → passages beyond the cited ones → never the row wording or the draft.
- For each row below threshold: gap type (spec 02 §D).
- **Next move (code):**
  - all rows ≥ threshold → `final`.
  - else if pass < 5 **and** a concrete gap exists **and** (pass = 1 or the field's lowest row score rose by ≥ 0.02 last pass): redraft. *Concrete* = a `drafting` gap with at least one confirmed passage for that row not cited in the draft, or an `evidence` gap where a re-search (step 4 limited to that row) found a new confirmed passage.
  - else → `final_with_flags`: rows with `information` → placeholder + Information needed flag; `conflict` / `strategic` → advisor decision flag; `eligibility` → blocker flag; `space` → out of space flag; remaining below-threshold rows → Below threshold issue.
- Out of space: fields sharing one box (form map `shared-box group`, e.g. AF-I.4 for MC-4a–4d, AF-F.4b/c) stop and flag; the app never trades rows off.

### 7.6 After all fields: overall and consistency
- Overall OV-C and OV-E (spec 02 §G) once all fields are final, and again after any redraft or re-assessment.
- Consistency (D11): code extracts numbers, dates, TRL, partner names, headcounts per field; compares by rule; ambiguous pairs go to the decision model ("These two statements are consistent") and anything below 0.5 is flagged as a conflict. **Proposed** threshold.

### 7.7 Explanations, chat and redraft
- Weak/fix text: `worker` role, on first open of an item; cached by (row, field fingerprint).
- Chat: `chat` role (the selector in the chat box picks among configured models); context = the item (row wording, draft, scores, passages) or the whole-application summary. Answers only.
- Redraft (single field or all): §7.3 with advisor guidance; advisor facts first extracted (`worker` role) into Advisor note passages.

### 7.8 Speed, cost and resilience rules
- Fingerprint per field = hash(package version, field definition, rows' wording, cited-and-available passages' IDs and text hashes, reference answer hash, advisor guidance, the model and effort each role resolved to). Unchanged → skip.
- Concurrency: all ready fields in parallel, bounded by a per-provider limiter that respects rate-limit headers; 429s back off and retry per `retry-after`. A 429 with no `retry-after` (Anthropic's spend cap) pauses the run and tells the advisor; retrying won't help.
- Cache warm-up: a cached prefix is reusable only once the first response using it starts streaming. So for each shared prefix (per role and model) the limiter sends one request first and releases the rest when its first token arrives; otherwise parallel calls all pay full price.
- Prompt caching on the stable prefix of every call (§7.3 ordering).
- Every provider call is logged in `calls` (tokens, cost, latency, request id; **no content**).
- Resumability: each state transition is committed to SQLite before the next call; on relaunch, `drafting/reviewing/assessing` steps restart, completed steps don't.
- Budget guard (**Proposed**): a run pauses and asks the advisor if its cost passes 2× the target (US$16).

## 8. Decision model interface
```
ask(question) -> answer
question = { id, kind: "probability" | "choice" | "score",
             statement_or_prompt, state (text), options? (choice), rubric? (score) }
answer   = { value (probability 0–1 | option | level), confidence 0–1 | null,
             distribution? , model_id, model_version, latency_ms, cost_usd }
askMany(state, questions[]) -> answers[]   // many questions against one shared state
```
- **Threshold rule.** For `probability` questions the threshold applies to `value` (P(yes)); for `choice` and `score` it applies to `confidence`. Thresholds are set per implementation **and per question kind** in `models.json`.
- **Ask as yes/no where a probability is wanted.** DG-4 link confirmation, P(compelling) and P(eligible) are `probability` questions. Gap type (spec 02 §D) and document type are `choice`.
- Implementations: `jev` (below) and `llm` (any configured LLM, structured output returning value and a self-reported confidence).
- Thresholds are not assumed. WP-11 measures accuracy against the synthetic client's answer key per question kind and sets each threshold (target 0.99 where the measured accuracy supports it). Calibration (e.g. mapping raw P to observed accuracy on labelled rows) lives in the adapter if needed.

### 8.1 jev adapter (from `docs/research/jev.md`; not yet tested against the live API)
- One endpoint: `POST https://api.typesafe.ai/v1/systemone`, bearer key; `GET /v1/models`. Official SDKs: Python `typesafe-sdk`, npm `@typesafe-ai/sdk`. Use the SDK for the chosen engine language.
- Body `{model, state, questions:{<name>:{type: noul|choice|score, instructions, criteria}}}`. Map: `probability` → `noul` (returns P(yes) only, **no confidence**, so `confidence: null`); `choice` → `choice` (choice, probabilities, confidence; ≤ 255 options); `score` → `score` (expected score, probabilities, confidence).
- `askMany` = one request per shared state; group questions by identical state (e.g. all rows of one field's draft). Keep state + the longest question ≤ ~28K tokens (hard limit 32K; 64K per request in total).
- No streaming and no batch-job API; concurrency by parallel requests under the limiter (published limits 250K tokens/s, 1,200 requests/min, may change).
- Pin the model version (e.g. `jev-1.13.0`) in `models.json`, never `jev-latest`, so calibrated thresholds don't drift.
- Text input only, English. Arithmetic and date comparison are documented weak spots: do them in code (§7.6).
- Price about US$0.042 per million input tokens, output free: a full run's ~2.7M decision tokens is about US$0.11.
- Data: TypeSafe states it doesn't train on customer requests; zero retention is for enterprise customers (retention period and hosting unverified).

## 9. Language model interface

### 9.1 Contract
```
generate(role, {stable, variable}, schema?) -> { output, usage:{input, output, cache_read, cache_write},
                                                 cost_usd, model_id, request_id, stop_reason }
capabilities(provider, model) -> { json_schema, prompt_cache, effort_levels[], streaming, usage_reporting, max_context }
```
- The workflow passes a **role**, never a model (§9.2). `stable` is the cacheable prefix (§7.3 ordering); `variable` is the rest.
- Output is validated against the schema in code for every provider, with one retry; a second failure marks the step `failed(retryable)`.
- The workflow checks **capabilities**, not provider names. Settings refuses a mapping that lacks what a role needs (e.g. `drafter`, `worker`, `extractor` need `json_schema` and `usage_reporting`).
- Provider errors map to one set: `rate_limited(retry_after?)`, `spend_cap`, `overloaded`, `invalid_request`, `auth`, `network`.

Adapters (details and sources in `docs/research/llm.md`):
| Adapter | Maps | Notes |
|---|---|---|
| Anthropic | Messages API; `output_config.format` JSON schema; `cache_control` on the stable prefix; effort; streaming | Schema can't carry length or number limits (checked in code); make all properties required. Don't combine with the Citations feature (paragraph IDs replace it). Minimum cacheable prefix differs per model (512–4,096 tokens). No Batch API: it isn't covered by zero retention |
| OpenAI | Responses API; strict JSON schema; prompt caching; reasoning effort; `store:false` | GPT-6 Astra facts unverified (site blocked). Resend full input each call; no `previous_response_id` under zero retention. Long-context pricing above 272K input tokens |
| Microsoft 365 Copilot | Microsoft 365 Copilot Chat API (Graph); just another provider in `models.json`, swappable like the others (Calvin, 11:26) | Its capabilities today: text only (no JSON schema), no token usage or cost, no choice of underlying model. So the capability check lets it fill the `chat` role now; the other roles need structured output and open to it automatically if Microsoft adds it. Needs a Microsoft 365 Copilot licence and wider delegated Graph permissions than the SharePoint link (asked at first use). It also grounds answers in the user's own mail and Teams (can't be switched off); web grounding is turned off per message |

### 9.2 Model roles and `models.json` (D20, D26)
Code and prompt templates name **roles only**. No model ID, provider name, price or effort level appears anywhere in the workflow code or prompts. One file says which model fills each role:

```json
// models.json (app data folder; editable in Settings; shipped with the starting values below)
{
  "roles": {
    "drafter":   { "provider": "anthropic", "model": "<id>", "effort": "high" },
    "worker":    { "provider": "anthropic", "model": "<id>", "effort": "low" },
    "extractor": { "provider": "anthropic", "model": "<id>", "effort": "low" },
    "decider":   { "provider": "jev",       "model": "<id>", "threshold": 0.99, "state_limit_tokens": 32000 },
    "chat":      { "provider": "anthropic", "model": "<id>", "choices": ["<id>", "..."] }
  },
  "providers": { "anthropic": {...}, "openai": {...}, "jev": {...} },
  "prices":    { "<id>": { "input_per_mtok": 0, "output_per_mtok": 0, "cache_read_per_mtok": 0,
                             "cache_write_per_mtok": 0, "long_context_over_tokens": null, "long_context_multiplier": null } }
}
```

| Role | Jobs | Starting value (config only) |
|---|---|---|
| (code) | Paragraph extraction, spreadsheets, rule checks, data extractors | No model |
| `decider` | Document type, party, split; link confirmation; reference pick; all scoring; gap type; consistency judgement | jev; the LLM stand-in until jev credits exist |
| `worker` | Candidate passages; review; weak/fix text; advisor-fact extraction; consistency fact extraction | A mid-tier Claude model, low effort |
| `extractor` | Leftover data fields | The cheapest Claude model |
| `drafter` | Narrative drafting and redrafting | The top Claude model at high effort, or GPT-6 Astra: whichever wins the bake-off (WP-11) |
| `chat` | Chat answers | Same as `drafter`; the chat-box selector lists `choices` |

Rules:
- Swapping a model is an edit to `models.json` (or Settings), with no code change and no restart. A new provider is one adapter behind §8/§9.1 plus a `providers` entry.
- Prompts are written per role and must not rely on one vendor's quirks; provider-specific request options (caching, structured output, effort) are mapped inside the adapter.
- Cost is computed from `prices`, so a new model needs only its price row.
- The exact model IDs for the starting values are set once, in the shipped `models.json`, at build time (WP-6), from the current provider model lists.

## 10. Non-functional requirements

### 10.1 Performance and cost (D19) — measured on the synthetic client with the starting `models.json`
| Measure | Target |
|---|---|
| One field drafted, reviewed and scored | ≤ 60 s, ≤ US$0.25 |
| Full application, first run | first fields ≤ 60 s; all ≤ 3 min; ≤ US$8 |
| Re-run after a few changes | ≤ 1 min, ≤ US$1 |
| Digest of ~200 pages on upload | ≤ 60 s, ≤ US$1 |
| UI | typing, scrolling, panel moves with no visible lag; opening a 30-page DOCX ≤ 2 s |

### 10.2 Quality
- Verbatim: 100% of passage text equals source paragraphs (F-05 AC2).
- No invention: F-09 AC4–AC5.
- Traceability: every drafted sentence → passage(s) → document location; every row → verbatim guideline wording.
- Drafting quality: the bake-off (WP-11) records P(compelling) per row for both drafting models on the synthetic client; the winner is the default.

### 10.3 Privacy and security
- Outbound network calls only to the configured model providers, jev and Microsoft Graph (and the app's own update check if added later). SuperDoc telemetry off. No analytics. Automated test: run the synthetic client with a proxy log; any other host fails the test.
- No client content in logs; the calls table stores metadata only.
- API keys only in Windows Credential Manager.
- Desktop shell hardened per the chosen shell's security checklist (research).
- Client folders are plain folders the advisor controls; deleting an application deletes its folder after confirmation.

### 10.4 Reliability
- Crash-safe writes (atomic replace) for `.xlsx`, `.json` and the DOCX; SQLite in WAL mode.
- Resume runs after a crash (F-09 AC3). Provider errors retried with backoff; a field that still fails shows as an issue with Retry.
- Offline: viewing, editing and export work offline; runs and digest wait for the network and say so in the progress line.

### 10.5 Maintainability and extension seams
- Grants are data (packages), not code. Adding a grant = adding a package.
- Models and decision models are settings behind §8/§9.
- Single-user assumptions are isolated: storage paths, settings and credentials behind one module, so multi-user or web can replace them later.

## 11. Synthetic test client — "Harbour Robotics" (built in WP-11)
- Lead: Harbour Robotics Pty Ltd (SME, 42 staff, marine inspection robots). Partners: Portside Marine Services (industry) and a fictional "Southern Coast University" (research organisation). All names fictional.
- About 12 documents, ~200 pages total: board minutes (DOCX), project plan v2 and v3 (PDF; v3 supersedes), financials FY26 (XLSX), company extract (PDF), partner letter (PDF), university research proposal (DOCX), CVs (PDF), IP licence (PDF), market sizing notes (DOCX), supplier quote (PDF), one exact duplicate file, one scanned (image-only) PDF.
- Planted facts with an **answer key** (`fixtures/harbour/answer-key.json`): expected passage-to-row links; information gaps (e.g. target customers and pricing for MC-4d.1); conflicts (TRL 4 in the plan vs TRL 5 in the minutes; headcount 42 vs 38); an evidence item only in the board minutes (MC-4a.3: "the board will not fund the multi-port trials from retained earnings").
- Also one reference application (fictional, funded, prior round) for style.
- Used by: F-05, F-09, F-12, F-17 checks, the model bake-off and the decision-model calibration.

## 12. Work packages

| WP | Package | Depends on | Delivers |
|---|---|---|---|
| WP-0 | Repo scaffold, shared schemas, CI (lint, types, unit tests, Windows build) | — | Monorepo layout, schema module (§4.2, §5.3, §8, §9), CI green |
| WP-1 | Shell and layout (F-01) | WP-0 | Window, drawer, panels, tree, theming, settings screen skeleton |
| WP-2 | Document viewers (F-03 viewing) | WP-1 | PDF.js with passage highlight, DOCX read-only, XLSX sheet, MD |
| WP-3 | Form editor (F-08, F-15) | WP-1, WP-12 | SuperDoc integration, answer boxes, colours, char counts, clean export |
| WP-4 | Storage and application folders (F-02, §5) | WP-0 | Package loader, folder creation, SQLite schema and migrations, xlsx read/write |
| WP-5 | Ingestion (F-03 add, §7.1 steps 1–2) and SharePoint link | WP-4 | Upload, drag-drop, dedupe, paragraph index, Graph sign-in and folder sync |
| WP-6 | Provider adapters and model roles (§8, §9, §10.3) | WP-0 | `models.json` and role resolver, Anthropic, OpenAI, jev (stubbed where unknown), LLM stand-in, limiter, usage logging, Credential Manager, CI grep for model IDs |
| WP-7 | Digest (F-05, F-07, §7.1 steps 3–8) | WP-5, WP-6 | Classification, candidates, confirmation, data extraction, digest table |
| WP-8 | Drafting loop (F-09, F-13, F-14, F-17, §7.2–§7.6, §7.8) | WP-6, WP-7 | State machine, draft, review, assess, decide, overall, consistency, fingerprints, resume |
| WP-9 | Right panel and chat (F-10, F-11, F-12, §7.7) | WP-1, WP-8 | Summary, issues, jump, detail, lazy weak/fix, chat, Draft/Redraft, advisor notes |
| WP-10 | Tables UI (F-06, F-07 editing) | WP-4 | Requirements and digest table editors |
| WP-11 | Synthetic client, evaluation harness, bake-off, calibration (§11, §10) | WP-6 | Fixture documents and answer key; scripts measuring every §10 target; bake-off report |
| WP-12 | CRC-P Round 19 grant package (§5.1) | WP-0 | manifest, documents, requirements-table.xlsx, form-map.json (all fields, anchors verified), questions.json, rules.json |

Parallel lanes after WP-0: {WP-1 → WP-2, WP-3}, {WP-4 → WP-5 → WP-7 → WP-8}, {WP-6}, {WP-10}, {WP-11}, {WP-12}; WP-9 joins last. Integration test: WP-11's full synthetic run through the UI.

Tracked as GitHub issues #3–#15 (label `work-package`; WP-n is issue #n+3). **Changing a package:** edit this section and the issue together. Once an agent has started a package, post the change as a comment on its issue so the agent sees it.

Each WP's PR includes: what was built, how it was verified in the running app, which acceptance checks pass, measured numbers where §10 applies.

## 13. Open before build starts
1. Stack (§4.1): researched and proposed; Calvin to confirm. PDF export via Word (Calvin has Word, 11:26).
2. jev: API shape researched from the official SDKs (§8.1). Still needed: an API key (Calvin adds credits) and a live test of limits, latency and calibration in WP-11. Until then WP-6 builds against §8 with the LLM stand-in.
3. GPT-6 Astra: facts unverified (OpenAI's site blocked here); confirm with a test call in WP-6 before the bake-off. Copilot: one more provider in `models.json` (§9.1), not a separate feature; today it can fill the chat role only. Needs a Microsoft 365 Copilot licence.
4. ~~Specs 01–04 cleanup~~ Done: each carries a note that this file wins, and the stale lines are fixed.
