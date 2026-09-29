# Drafting workflow — design spec (v0.9)

Status: draft for Calvin's review · 2026-09-27 · v0.3 applies Calvin's 05:32, 05:40, 05:42 and 05:47 comments. Full jev question list: `02-jev-question-list.md` · First grant: CRC-P (Round 19 reference pack in `reference/crc-p/`)

> **Superseded where it differs.** `05-build-spec.md` is the build source of truth and records Calvin's later decisions (10:13–10:46, D1–D26). Where this file and spec 05 disagree, spec 05 wins.

Each item is marked **Agreed** (Calvin confirmed in the design thread) or **Proposed** (suggested by Claude, not yet confirmed). Nothing here is final until Calvin says so.

---

## 1. Purpose

A platform for grant advisors. It brings together, in one screen, the work an advisor does today in separate places: digesting client source documents, drafting the application (today in Word), assessing eligibility (today in their head), and writing RFIs to the client (today in email). **Agreed**

Behind the screen is an agentic workflow. It uses an LLM (whichever model fills the drafting role; spec 05 §9.2) and a decision model (jev first; spec 05 §8) (TypeSafe AI's decision model) to strengthen the application toward winning the grant, or to say what further information is needed. **Agreed**

It's grant-agnostic. CRC-P is the first grant because it's the simplest. It isn't tied to one round. **Agreed**

## 2. Scope

| In scope now | Out of scope for now |
|---|---|
| The government application form, drafted and assessed field by field | The RFI workflow: what was previously requested, how the RFI is structured, matching asks to client documents, prior RFI examples. For now the process only **flags that an RFI is needed, and with what information** (§7). **Agreed** |
| Eligibility assessment | Budget and the Financial Workbook (the form's budget and contribution tables, F.2 and H). **Agreed** |
| Traceability from guidance to output, and from client source to output | |
| Chat in the right panel that answers and feeds Draft/Redraft (spec 03 §2, spec 05 §7.7). **Agreed** | |

## 3. Deliverables (CRC-P)

The application is one online form, about 60 fields in sections A to M. It's plain text with character limits (for example, 5,000 per merit criterion and 1,000 per partner). The tool's primary output is **a draft of every field in that form, within its limits**. The form is the government's form as given. The tool does not change its structure. **Agreed**

The only attachments CRC-P asks for are a trust deed (if the lead applies as trustee) and ICN or Supply Nation evidence (to claim the Indigenous priority). Everything else the guidelines say not to attach, so its content has to fit inside the form fields (GL §7.1). Source: `reference/crc-p/06-attachments-and-deliverables.md`.

## 4. Screen layout — **Agreed**

Modelled on the Claude Code app.

| Area | Holds |
|---|---|
| **Centre (main view)** | The application form. The advisor can edit any field directly. |
| **Left panel** | The open application's tree, in five sections: grant documents, workflow documents (requirements table, digest table), deliverables, source documents, references and templates. Order, defaults and behaviour: spec 03 §2. |
| **Right panel, field selected** | For that field: the requirements it touches (eligibility gates and merit sub-criteria, with their exact guideline wording), jev's score and status, the supporting evidence (exact source passages with document, page and paragraph links), gaps, and the LLM's "why it's weak and how to strengthen it" text. |
| **Right panel, nothing selected** | A whole-application summary: jev's overall P(compelling) and P(eligible) (spec 02 §G), then Issues, the jev questions below the 0.99 threshold and open flags (RFI needed, advisor decisions). |

Purpose of the right panel: to show **how strong each answer is and the evidence supporting it**. The form can't show this itself, because the evidence behind many "Yes" ticks (for example AF-B.1 SME status and the AF-M.2 declarations) never goes on the form, and criteria and fields are many-to-many (for example, MC-2a draws on AF-I.2, G.2, G.9 and F.4b).

## 4b. Requirements table — **Agreed**

The grant knowledge the workflow runs on. One row per granular piece of guideline wording. It's editable by the advisor and opens from the left panel.

| Column | Holds |
|---|---|
| ID | Requirement row ID, for example `MC-4a.2` (sub-criterion 4a, second piece of wording) or `EL-11.3` |
| Exact guideline wording | The verbatim words for this row only, broken down so each row is one thing the assessor looks for |
| Deliverable | What the row is delivered in. For CRC-P that's the application form. |
| Form field | The form field(s) the row is answered in, for example AF-I.4 |
| Items from client | What the client needs to supply for this row |

That's all the columns. Example rows:

| ID | Exact guideline wording | Deliverable | Form field | Items from client |
|---|---|---|---|---|
| MC-4a.2 | "justification for the funding amount requested" | Application form | AF-I.4 | Budget and why this amount; board papers |
| MC-4d.3 | "plans at the end of the project" | Application form | AF-I.4 | Post-project commercialisation plan and funding; business plan |
| EL-11.3 | "industry-led" | Application form | AF-G.2 | Who identified and drives the project; lead SME's role |

The full CRC-P row list (30 merit rows, 15 judgement eligibility rows, plus the rule-checked gates) is in `02-jev-question-list.md` §A.3 and §B.

## 5. The workflow

Runs **per form field / merit sub-criterion**. **Agreed** (the four steps)

```
 GRANT KNOWLEDGE
 Guidance PDF ──► Requirements table ──► Items to request
                  (verbatim, granular;     for each requirement
                   advisor-editable)
            │
 Client documents ──► 1 DIGEST ──► digest table (tagged passages,
                                    advisor-editable)
                                        │
                                        ▼
                                   2 DRAFT  ◄─────────────────────┐
                                        │                         │
                                        ▼                         │
                    2b REVIEW (LLM only)                          │
                       redundancy · flow · superfluous wording    │ redraft
                                        │                         │
                                        ▼                         │
                    3 ASSESS                                      │
                       jev: P(compelling)  per requirement row    │
                       jev: P(eligible)    per judgement gate     │
                                        │                         │
                                        ▼                         │
                    4 DECIDE (jev: gap type) ─────────────────────┘
                                        │
                  ┌─────────────────────┼─────────────────────┐
                  ▼                     ▼                     ▼
          STOP: P(compelling)    FLAG: RFI needed      FLAG: advisor decision
          and P(eligible)        (info required)       (conflict, blocker,
          all ≥ 0.99                                    strategy, out of space)
```

### 0. Threshold — **Agreed**
- One threshold for everything: jev's probability that the response is compelling to assessors must be **≥ 0.99**. It isn't set per grant or per sub-criterion.
- 0.99 is a trial value. We test whether it's reachable in practice and adjust if needed.

### 1. Digest — **Agreed**
- Pulls **exact passages** from the client documents. It never paraphrases.
- The output is a **table the advisor can edit**. Clicking it in the left panel opens it in the centre as an editable form (add, remove or retag passages, fix locations). **Agreed**
- How it runs: jev sorts each document by type and party and splits bundled files (DG-1 to DG-3). The LLM finds candidate passages for each requirements table row. jev confirms each passage-to-row link (DG-4, ≥ 0.99), and links between 0.5 and 0.99 are shown to the advisor as suggestions.

**Digest table** (Claude's design, per Calvin's hand-off). One row per passage:

| Column | Holds |
|---|---|
| Passage ID | For example `P-014` |
| Source document | File name and document type (jev DG-1) |
| Location | Page and paragraph (sheet and cell for spreadsheets, timestamp for recordings) |
| Party | Lead applicant / named industry partner / named research organisation (jev DG-3) |
| Exact passage | Verbatim text, never paraphrased |
| Requirement rows | The requirements table row IDs this passage supports. There can be several. |
| P(supports) | jev's probability for each linked row (DG-4) |
| Status | Confirmed (≥ 0.99) / suggested (0.5 to 0.99) / added by advisor / rejected by advisor |
| Used in | Read-only backlink: the form fields and draft sentences that cite this passage |

How it links up:
- Requirements table to digest table is many-to-many, through the "requirement rows" column. Filtering the digest table by a row ID shows all the evidence for that requirement. A row with no confirmed passages is an information gap before drafting starts.
- Draft sentences cite passage IDs. The right panel shows the passage text and opens the source document at that location.
- Advisor edits follow §6. Removing or rejecting a passage marks the draft sentences that cite it as "unsupported". It doesn't trigger a redraft.
- Why digest: traceability to the source (what each claim rests on), the same evidence reused across about 60 fields, jev's 64K-token input limit, and gaps visible before drafting. General long-context research (Liu et al. 2023, "Lost in the Middle"; Chroma 2025, "Context Rot") supports giving the drafter focused input, but there's no grant-specific evidence that it improves quality.

### 2. Draft — **Agreed**
- **If a reference application is provided**, the LLM drafts each field in the wording and style of that reference application, with the aim of winning the grant. It doesn't need to use the client's own words. **Agreed**
- If none is provided, it drafts with the same aim of winning the grant, without a style reference.
- The substance (facts, figures, claims) comes from the digest table passages. The drafter can open the full source document when it needs more context.
- It writes within the field's character limit.
- When the evidence for a requirement row isn't in the digest table, it writes a red placeholder naming the missing information instead of drafting content (Calvin, 06:12). **Agreed**
- Each sentence links to the source passage(s) it relies on. **Proposed** (sentence-level granularity)

### 2b. Review — **Agreed** (LLM only, Calvin 06:00)
- A separate **review agent** (LLM) does one editing pass over each narrative draft, checking:
  - **Redundancy:** each point is made once. It doesn't repeat a point, figure or claim already made in this field or in related fields that feed the same criterion, unless it's needed for a different requirement.
  - **Flow:** a logical order an assessor can follow on one read. It opens with the main point, and each paragraph follows from the one before.
  - **Superfluous wording:** no padding, filler, hedging or generic language. Cutting it frees characters.
- No jev scoring of style, and no style guidance or scores are shown to the advisor.
- The review edits wording only. It keeps every claim and its link to the digest table passage. **Proposed**
- The reviewed text then goes to 3 Assess.

### 3. Assess — **Agreed**
- jev assesses the **probability that the response is compelling to assessors** for each requirements table row, judged against the exact guideline wording. **Agreed**: scored per requirement row, not per sub-criterion (Calvin, 05:56), so every piece of wording is covered and traceable. There are 30 rows for CRC-P. Questions and state: `02-jev-question-list.md` §A.
- It uses reference applications (past funded or unfunded) as the benchmark.
- jev writes no text, so the LLM writes the explanation: what's covered, what's weak or missing, and how to strengthen it.
- Eligibility:
  - Judgement gates (for example EL-11, "industry-led collaborative research"): jev, as a probability. **Agreed** 15 rows, listed in `02-jev-question-list.md` §B.1.
  - Arithmetic and lookup gates (dates, amounts, ABN, headcount thresholds): plain code, not a model. **Proposed**
  - Yes/no disclosures and declarations (G.11, G.12, M.2): never answered "No" just because the documents are silent. They're always flagged for client confirmation. **Proposed**

### 4. Decide — **Agreed** (jev does it)
jev classifies each gap into one of these types, and the type sets the next move:

| Gap type | Meaning | Next move |
|---|---|---|
| Drafting gap | The evidence is in the passages but was unused or weakly phrased | Redraft |
| Evidence gap | A claim is made but no passage supports it | Search the documents again. If still nothing, flag RFI needed |
| Information gap | No passage covers the requirement | Flag RFI needed |
| Conflict | Documents or fields disagree (for example TRL, milestones, partners) | Flag for advisor decision |
| Eligibility blocker | A gate fails, and drafting can't fix it | Stop and flag to the advisor |
| Strategic choice | Framing only the advisor or client can set (for example which NRF priority to claim) | Flag for advisor decision |
| Space | The row can't improve without taking characters from another row in the same box | Stop and flag (out of space) |

Default list, set by Claude. Calvin can change it.

### 5.5 Which fields go through the full loop — default (Claude)
"Full loop" means draft, review, assess and decide, repeating until the threshold or a stop.

| Field kind | Examples | Handling |
|---|---|---|
| Narrative | G.1a/b, G.2, G.3, G.5, G.7, G.9 descriptions, F.4b, I.1 to I.4, J.1, J.5, J.6, L.1 | Full loop |
| Data | ABN, addresses, contacts, dates, headcount, TRL, ANZSIC, dropdowns (J.2, J.3, J.7), personnel (G.4), sites (G.10) | Filled from the digest table, then checked by code where there's a rule. No drafting loop. If the value isn't in the digest table, flag RFI needed. |
| Disclosure / declaration | B.1–B.6, E.3, F.4d/e, G.11, G.12, G.13, L.1 yes/no, M.1–M.2 | Never inferred or suggested. Left blank and flagged for the advisor to fill (Calvin, 10:41). |
| Budget | F.2, H | Out of scope for now |

### Stop conditions — **Agreed**
1. **Threshold reached.** P(compelling) and P(eligible) are all ≥ 0.99.
2. **No progress.** One pass by default; a redraft happens only on a concrete gap, and stops when a pass raises the field's lowest row score by less than 0.02, or after 5 passes (Calvin, 10:23–10:35; spec 05 §7.5). Remaining gaps are flagged.
3. **Out of space.** Sub-criteria sharing one character-limited box (for example AF-I.4 is 5,000 characters for MC-4a to 4d) can't all reach the threshold. **Stop and raise it only.** The tool doesn't trade them off. The advisor resolves it in the form.

## 6. Advisor edits — **Agreed**
- Manual edits to the form only update the text. They don't trigger any agent or jev re-run, or any other change.
- The agent never overwrites advisor text unless the advisor asks for a redraft (the Draft/Redraft button in the chat box).
- Default (Claude): the right panel labels an edited field "edited since assessed". It's a label only, with no agent or jev run, so the advisor knows the scores shown are from before the edit. Re-assessment runs only when the advisor asks.

## 7. "RFI needed" flag (until the RFI workflow is designed) — **Agreed**

When the process can't reach the threshold because information is missing, it raises a flag rather than drafting an RFI. In the form, the flag shows as a **red placeholder in place of drafted text**: the drafter never invents content for a gap (see `03-ux-spec.md` §3). **Agreed** Each flag carries: **Proposed** (fields)

| Field | Example |
|---|---|
| Requirement ID(s) and exact guideline words | MC-4d: "expected commercial outputs… plans at the end of the project" |
| Form field(s) affected | AF-I.4, AF-G.3 |
| Information required | Target customers and price point for the new product, and the route to market after year 3 |
| Why | Information gap: no passage in the client documents covers it |
| Likely source party | Lead SME |
| Blocking or strengthening | Strengthening (merit) / blocking (eligibility) |

## 8. Traceability chain — **Agreed** (requirement), **Proposed** (shape)

Guidance PDF (exact words) → requirements table row (requirement ID, items to request) → form field → draft sentence → digest table passage (document, page, paragraph) → jev probability and gap type → flag. The advisor adjusts requirements in the requirements table and evidence in the digest table.

## 9. Open items

1. How edits to the requirements table and digest table trace back (edit history, what happens to drafts already written).
2. ~~Reference application choice~~ Decided (10:23): the model picks the closest one.
3. ~~Cross-field consistency~~ Decided (10:23): a check after all fields are final; conflicts are flagged (spec 05 §7.6).
4. Checking that drafted claims stay supported: the style can follow the reference application, but claims should still rest on digest passages. The applicant declares the information is accurate under the Criminal Code (AF-M.2). **Proposed**
5. Further jev checks considered but not adopted yet: P(supported), P(covered), P(consistent), P(publishable) (AF-G.1a/b hold nothing confidential), P(matches reference style).
6. Right panel details beyond §4 (Calvin: undecided; §4's contents stand as the default).
7. Later topics: the RFI workflow, budget and workbook. Chat placement, model choice, ingestion, stack and data handling are now in specs 03–05.
