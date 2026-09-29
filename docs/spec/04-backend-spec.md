# Backend and technology decisions — design spec (v0.3)

Status: list of decisions to make, for Calvin's review · 2026-09-27 · Companion to specs 01–03

> **Superseded where it differs.** `05-build-spec.md` is the build source of truth and records Calvin's later decisions (10:13–10:46, D1–D26). Where this file and spec 05 disagree, spec 05 wins.

Marked **Agreed** (Calvin confirmed) or **Proposed** (Claude's default, not yet confirmed). Items 1 (SuperDoc, PDF.js view only) and 10 are agreed; the rest are carried into spec 05 (decisions register and §4.1).

| # | Decision | Default (Proposed) | Why it matters |
|---|---|---|---|
| 1 | In-app Word and PDF editing | Research embeddable DOCX/PDF editor components before choosing | Biggest build item. The form is edited as the government's DOCX inside the app (spec 03 §3). The choice may decide the desktop shell. |
| 2 | Drafting and review LLM | No model is hard-coded: roles mapped in `models.json` (spec 05 §9.2). Starting drafter picked by a bake-off on the synthetic client | Drafting quality is what wins the grant. |
| 3 | jev access | Apply for early access now and test whether the 0.99 threshold is reachable | jev is in limited early access; the whole assess and decide loop depends on it. |
| 4 | Chat model (Microsoft Copilot) | Check what Microsoft lets a third-party app use; until then the chat uses the drafting LLM | Calvin expects the chat to be hooked to Copilot. |
| 5 | Desktop shell: Electron or Tauri | Windows only (Calvin, 10:18); final pick in spec 05 §4.1 after research | Holds the web-technology interface (spec 03 §1). |
| 6 | Workflow engine | A separate local process the interface calls; language chosen with #1 and #2 | Keeps a later move to web cheap (spec 03 §1). |
| 7 | Storage | One folder per application on disk holding its documents and tables (§10), plus a small local database for scores, flags and run history | Everything stays on the advisor's computer. |
| 8 | SharePoint | Microsoft Graph with the advisor's sign-in, read access to linked folders only | Source documents can be linked rather than copied (spec 03 §2). |
| 9 | Data sent to providers | Use the providers' no-training and zero-retention API terms; record what each call sends | Client documents leave the computer for the LLM and jev. |
| 10 | Grant library and application folders | See §10 | Each grant's documents and requirements table are prepared once and copied into every new application (Calvin, 10:09). |

## 1. Word and PDF editing in the app — research (2026-09-27)

### What's needed
- **Word (the form):** open the government DOCX exactly as it is, insert an answer under each question, mark sentences yellow or red, let the advisor edit, and save back to a real .docx. Export is a clean copy (spec 03 §4 step 7), so the yellow and red marks are stripped on export.
- **PDF (grant documents and client sources):** show the page and highlight a cited passage when an evidence link is clicked (spec 03 §2). Editing PDFs isn't needed by the workflow; whether it's wanted is Calvin's call.

### Options for Word

| Option | How it works | Licence and cost | Notes |
|---|---|---|---|
| **SuperDoc** | Runs entirely inside the app (no server). Edits the DOCX's own XML directly | AGPL-3.0 (free if our source is released) or commercial, Business tier $6,000/yr | **Tested on the actual CRC-P form** (below). Has a document API built for AI agents (find a block, insert after it) |
| Syncfusion Document Editor | Needs a .NET web service to open a DOCX (it converts to its own format, SFDT) | Free community licence under $1M revenue, 5 or fewer developers and 10 or fewer employees; otherwise $1,199 per developer per year | Would mean bundling a local .NET service in the desktop app. Not tested |
| ONLYOFFICE Docs Developer Edition | Needs its Document Server | AGPL, or Developer Edition from about $1,911 | Most complete, but heaviest to bundle. Not tested |
| Apryse WebViewer | Runs in the app (WebAssembly); Word and PDF in one product | Quote only; web licences reportedly start around $10,000/yr | One vendor for Word and PDF. Not tested |
| Nutrient (PSPDFKit) | Runs in the app; PDF-first, with Office support | Reported $8,000–$40,000/yr | PDF-first. Not tested |

### Test of SuperDoc on the CRC-P form (in this container, SuperDoc 2.18.0 in headless Chromium)
- Rendered all **30 pages** of `crcp-r19-sample-application.docx`, with the government header, footers, the "OFFICIAL" marking and the "sample" watermark. The container's LibreOffice couldn't open this file at all.
- Found the question "Are you a SME at lodgement of this application?" by text, inserted an answer paragraph straight after it, highlighted yellow. Screenshot: `spec/assets/superdoc-test-answer-inserted.png`.
- Saved back to .docx: the answer sits right after the question as a normal Word paragraph with Word's own yellow highlight, and the watermark header is kept.
- **Sends a usage ping by default** (a "document opened" event to superdoc.dev). It can be switched off in its settings; tested switched off, and no call went out. Must be off, because client files stay local.
- Its search-and-scroll call returned nothing in the test; jumping to an issue (spec 03 §2) would use its block IDs instead, which worked.

### Options for PDF
- **PDF.js** (Mozilla, the viewer inside Firefox): free (Apache-2.0), runs in the app, shows pages and can highlight a passage. Enough for evidence links.
- Full PDF editing needs Apryse or Nutrient, at the costs above.

### Recommendation — **Proposed**
- Word: **SuperDoc**, with telemetry switched off. **Agreed** (Calvin, 10:41) Use the AGPL build while building; buy the commercial licence ($6,000/yr) before the app goes to anyone else, unless the code is released under AGPL.
- PDF: **PDF.js**, viewing and passage highlight only. **Agreed** (Calvin, 10:00: view only, no PDF editing)
- Effect on other decisions: both run as plain JavaScript inside the window, so neither forces the shell (item 5) or the engine language (item 6). SuperDoc also has Node and Python SDKs, so the engine can edit the DOCX directly in either language.

### Enterprise use (Calvin asked, 09:57)
- **Licence:** many enterprise legal teams won't accept AGPL. The commercial licence removes that. Business ($6,000/yr) covers one "document experience" (web and desktop versions of the same feature count as one); several products or platform-wide use needs Enterprise (custom price, SLA options).
- **Security review:** SuperDoc says it can supply a SOC 2 Type II report, security and data-flow documents and a software bill of materials, and that it runs air-gapped (vendor's claims, not checked). Telemetry must be off (tested above).
- **Vendor risk:** a small company (Harbour Enterprises). The code is open source, so the last release keeps working if they stop.
- **PDF.js:** Apache-2.0, no enterprise concerns.
- **Bigger enterprise issues sit elsewhere:** client documents going to the LLM and to jev (items 2, 3, 9; jev is an early-access startup), installing and updating a desktop app under company IT (code signing, managed install), Microsoft Graph needing tenant admin consent (item 8), and the app having no login of its own, so no access control or audit trail beyond the computer's.

Sources: superdoc.dev and its licensing page; superdoc.dev licensing and SOC 2 notes; GitHub Harbour-Enterprises/SuperDoc; npm package `superdoc`; Syncfusion help pages on the Document Editor web service and its community licence page; onlyoffice.com Developer Edition pricing; apryse.com pricing guide and Verdocs' 2026 Apryse pricing guide; Vendr and nutrient.io on Nutrient pricing.

## 10. Grant library and application folders (Calvin, 10:09)

**Agreed** (Calvin's words, 10:09):
- The app **stores each grant**: its application form, its guidance and other grant documents.
- Each grant's **requirements table is predefined** and stored with the grant.
- Starting a new application **copies the grant's documents and its requirements table into the application's new folder**, where they appear under "CRC-P documents" and "Workflow documents" (spec 03 §2).

**Proposed** (defaults, not yet confirmed):
- **What a grant package holds:** the guidance and other grant documents as published; the application form (.docx); the requirements table; the map of where each question sits in the form (spec 03 §3); the jev questions for each row (spec 02); and each field's character limit.
- **Who prepares it:** we do, once per grant round, checked against the government's documents (as done for CRC-P Round 19 in `reference/crc-p/`). The advisor doesn't build them.
- **Rounds:** each round is its own package ("CRC-P Round 19"). A new round is a new package; applications already started keep the package they were copied from.
- **Edits stay local:** the advisor's edits to the requirements table change only that application's copy, never the library. A fix that should apply to every future application is made in the library by us.
- **Delivery:** packages ship with the app and its updates, read-only in the app's own data folder. A grant appears as a choice under New application once its package is added.
- **File formats:** the requirements table and digest table are .xlsx files in the application folder, shown and edited in the app's table view; everything else keeps its original format.
- **Folder layout for one application:**

```
Grant Workbench/
  Harbour Robotics – CRC-P Round 19/
    Grant documents/          copied from the library (guidelines, form, templates)
    Workflow/                 requirements-table.xlsx (copied), digest-table.xlsx
    Deliverables/             R&D application.docx (the working copy of the form)
    Sources/                  local uploads and dragged-in files
    References and templates/
    .workbench/               scores, flags and run history (the local database)
```
