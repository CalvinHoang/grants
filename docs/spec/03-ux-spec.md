# Front end and UX — design spec (v0.11)

Status: draft for Calvin's review · 2026-09-27 · Companion to `01-drafting-workflow-spec.md`

> **Superseded where it differs.** `05-build-spec.md` is the build source of truth and records Calvin's later decisions (10:13–10:46, D1–D26). Where this file and spec 05 disagree, spec 05 wins.

Marked **Agreed** (Calvin confirmed) or **Proposed** (Claude's suggestion or default, not yet confirmed).

## 1. Platform — **Agreed**
- **Desktop app**, desktop screens only. There's no login of its own. Files are stored on the advisor's computer. The advisor signs in to Microsoft once, only to link SharePoint.
- Document content is still sent to the LLM and jev over the internet for processing (see the later data-handling topic).
- To keep a later move to web cheap: build the interface with web technology inside a desktop shell (Electron or Tauri), and keep the workflow engine as a separate part that the interface calls. **Proposed** (tech decision)

## 2. Layout — **Agreed**
Modelled on the Claude Code desktop app.

**Top bar:** a menu button on the left, then the open application's name. Nothing else: no status text and no Redraft/Export buttons (Calvin, 06:43). **Agreed**

**Menu drawer:** the menu button opens a hidden drawer that slides in from the left over the window (a light scrim behind it; clicking outside or the close icon slides it away). It holds everything general, so it stays out of view (Calvin, 06:20 and 06:52). **Agreed**
- **Applications:** "New application" and the list of other applications.
- **Export application:** Export as Word (.docx) or Export as PDF (.pdf). Clean copy only (§4 step 7).
- **Settings:** the Microsoft account link, model keys, and the 0.99 threshold (Calvin, 07:06). **Agreed**

**Left sidebar:** only the open application's documents, under five headings (Calvin, 06:26 and 07:06). **Agreed**

```
CRC-P DOCUMENTS            ← heading takes the grant's name; pulled in automatically
    Guidelines                 when the grant is selected (the grant's own documents)
    Application form
    Sample grant agreement
    Partners agreement template
    Financial workbook
    Program FAQ
WORKFLOW DOCUMENTS
    Requirements table       (editable)
    Digest table             (editable)
DELIVERABLES
    R&D application          ← the draft form
    Requests for information (out of scope for now)
        RFI for [party], [date created]
SOURCE DOCUMENTS    [+]    ← the client's files, each listed (PDF, Word, Excel, anything)
    Linked · SharePoint        Harbour Robotics / CRC-P
        Board minutes Aug 2026.docx
        Project plan v3.pdf
        Financials FY26.xlsx
    Local · this application   Grant Workbench / Harbour Robotics
        Partner letter.pdf
REFERENCES AND TEMPLATES  [+]    ← reference applications and templates the advisor supplies
    Reference application, Round 17.docx
    Letter of support template.docx
```

Sections are visually separated (spacing and a thin divider) and **collapsible**. By default only **Deliverables** and **Source documents** are open, and the grant documents and workflow documents are collapsed (Calvin, 06:35). **Agreed**

**References and templates** is the last heading, open by default, with the **same + button** as Source documents (SharePoint folder URL or upload files) (Calvin, 07:06). **Agreed** Reference applications placed here set the drafting style (spec 01 §2).

**Source documents** has a **+** button to **link a SharePoint folder URL** or **upload files**. There's no local folder link: each application gets its own new folder for its artefacts, and uploads go there (Calvin, 06:43). **Agreed**
- Files are **nested by where they live**, so it's clear what's linked and what's local: "Linked · SharePoint" (with the folder path) and "Local · this application" (the application's own folder) (Calvin, 06:49). **Agreed**
- **Drag and drop:** files dragged anywhere into the window are **copied into the application's local folder** and appear under "Local". This is behaviour only: no drop zone or "drop files here" text is shown (Calvin, 06:52). **Agreed**

Clicking any item opens that document in the centre **in its own format**: PDF pages as PDF, Word as a Word page, Excel as a sheet, Markdown as rendered text. In the real app, Word documents open in a proper document editor with native editing (akin to Word). PDFs are view only, with cited passages highlighted; no PDF editing (Calvin, 10:00). How that's built is in spec 04 §1. **Agreed**
Evidence links in the right panel open the source document at the cited passage, with the passage highlighted. **Agreed**

Flags have no sidebar item; they are the Issues in the right panel's summary. **Agreed**

**Centre:** whatever is selected in the tree. By default, the application draft. The centre widens when either side panel is collapsed.

**Panels:** the left and right panels are both collapsible and resizable, with the collapse icon **inside each panel** (Calvin, 06:49). **Agreed**
- Collapsing slides the panel closed (about 200 ms) while the centre widens to fill the space; the panel keeps its width and contents while sliding, so nothing reflows or jumps. Reopening reverses it (Calvin, 06:52). **Agreed**
- When a panel is collapsed, a small icon at that edge of the centre reopens it. **Agreed**

**Right panel:** answer strength and supporting evidence (spec 01 §4), with a **chat box at the bottom** (Calvin, 06:43). **Agreed**
- Summary (nothing selected), top to bottom (Calvin, 06:56): **Agreed**
  - **Overall:** jev's two whole-application probabilities, **Compelling** and **Eligible**, each with its percentage, a thin bar and the question put to jev. How they are produced is in spec 02 §G. **Proposed**
  - **Issues** (not "below threshold"): the **questions put to jev that are below threshold, each with its percentage**, not counts like "14/15". Questions at or above 99% are not listed. Information-needed items show "Information needed" instead of a percentage. **Agreed**
- **Jump to issue (behaviour, not shown as text):** clicking a flag or question opens the application draft if another document is showing, smooth-scrolls the centre to that question's answer box, and outlines the box in the accent colour while the item stays selected. The right panel switches to that item's detail. No "Go to …" hints or helper text appear on screen (Calvin, 06:49 and 06:52). **Agreed**
- Selected item: the exact question posed to jev, jev's percentage, the weak point and fix (one sentence each), and evidence. If the advisor has edited the text since it was scored, the percentage carries an "Edited since assessed" label; nothing reruns (spec 01). **Proposed**
- No style scores or style guidance are shown anywhere (Calvin; review is LLM-only, spec 01 §2b). **Agreed**
- Chat box: like Claude's composer. A text box, an attach button, a chip showing the selected item as context, a **model selector** (lists the models configured for the chat role in `models.json`, spec 05 §9.2; Microsoft Copilot if research shows it can be connected), and send. It chats with the agent about the selected item or the whole application.
- **Draft / Redraft button in the chat box**, next to send (Calvin, 07:03). **Agreed** It acts on the item in the context chip: "Redraft" for a drafted field, "Draft" where the field is still a red placeholder, and "Redraft all" when nothing is selected. Any text typed in the box goes to the drafter as guidance for that redraft (for example "use the board minutes"); Send only chats. Only that part goes back through the workflow (§4 step 6). **Proposed** (the label logic and typed-guidance behaviour)

## 3. The application draft view — **Agreed**
- For CRC-P the main application is the government's **Word file** (`crcp-r19-sample-application.docx`, uploaded by Calvin 06:43), opened and **edited in the tool**. It looks exactly like the government's document, with an editable answer box under each question (Calvin, 06:20 and 06:43). **Agreed** The mockup shows page images from the government's PDF of the same document, as a stand-in.
- Fact about the CRC-P file: the Round 19 sample application (Word and PDF, about 30 pages) has **no fillable fields and no answer space**. It lists the questions only, and every page carries a "sample" watermark. So the app inserts an answer box beneath each question. The question positions are mapped once per form template. **Proposed**
- The app uses the government file exactly as it is on the system, watermark included; nothing is stripped. This can change later (Calvin, 07:06). **Agreed**
- The mockup shows only a couple of pages; the real app shows the full form (Calvin, 06:47). **Agreed**
- Every text field shows a live character count against its limit. **Proposed**
- Colour coding:

| Colour | Meaning | What's shown |
|---|---|---|
| **Yellow highlight** | Below the 0.99 threshold, or needs advisor attention (conflict, strategic choice, out of space, eligibility blocker) | The drafted text is shown, highlighted |
| **Red placeholder** | More information is needed for this part | A placeholder **instead of** drafted text, naming what's missing, for example `[Information needed: target customers and pricing for the new product — MC-4d.1]` |
| No highlight | At or above threshold, nothing outstanding | Plain text |

- **The red placeholder rule stops hallucination.** When the evidence for a requirement row isn't in the digest table, the drafter must write a placeholder rather than invent content. The placeholder is how the "RFI needed" flag (spec 01 §7) shows up in the form.
- Highlight granularity: the yellow highlight covers the sentences that answer the weak requirement row, not the whole field. Sentences are linked to rows when drafted. **Agreed** (Calvin, 06:14)
- Clicking highlighted text or a placeholder opens that row in the right panel: its score, evidence, and why it's flagged.

## 4. Journey — **Agreed** unless marked
1. **Home:** the menu drawer lists applications, with "New application" at the top.
2. **New application:** pick the grant (CRC-P) from the grant library, name the client (the app creates the application folder and copies in the grant's documents and predefined requirements table, spec 04 §10), then link a SharePoint folder or upload files (which go into the application's own new folder), and optionally add reference applications.
3. **Before running:** optionally review or edit the requirements table, then press Start.
4. **Running:** runs in the background. Progress is one quiet line at the top of the right panel summary ("34 of 60 fields done"), gone when finished (Calvin, 07:06). A field appears only once it's final, so the advisor never sees drafts being rewritten. The advisor can close the window or work on another application meanwhile.
5. **Results:** the draft in the centre, colour coded (§3). With nothing selected, the right panel shows Overall (Compelling, Eligible) and then Issues (§2). Selecting a field or row shows its scores, evidence and "how to strengthen" text.
6. **Working the flags:** edit text directly (edits change only the text; nothing reruns). Ask for a **redraft of a particular section or field**. Only that part goes back through the workflow, and everything else stays untouched. Re-run the assessment when the advisor chooses.
7. **Export** from the menu drawer to Word or PDF, as a **clean copy only**: no highlights, placeholders flagged in plain text. **Agreed** (Calvin, 06:15)

## 5. Look and feel — **Agreed** (goal), **Proposed** (specifics)

Goal (Calvin): it must look good, like the Claude app, with no superfluous wording or commentary and good-looking graphics. We take inspiration from Claude's visual style, not its branding (no Anthropic logo, name or mark).

**Visual style**
- Calm and uncluttered: generous whitespace, thin dividers instead of boxes, no heavy borders or shadows.
- A warm neutral palette (off-white background, soft grey text for secondary info, one accent colour for actions). Light and dark modes.
- Colour carries meaning only. Yellow is for needs attention and red is for information needed (§3). Nothing else is coloured for decoration.
- Clean typography: one readable text face for the form and one for the interface, with clear size steps for section, question and answer.
- Minimal icons: small line icons only, used for controls (menu, collapse, +, chevrons, send).
- Scores are shown as small, quiet indicators (for example a thin bar or a dot plus the number), never as big dashboards or gauges.
- Subtle motion only: panels slide, the progress bar fills. No spinners in the form itself.

**Wording rules (all interface text)**
- Labels are 1–3 words. Buttons are verb-first ("Start", "Redraft section", "Export").
- No commentary or chatter in the interface: no "Great news!", no narration of what the AI is doing, no tips.
- Right panel explanations: the weak point in one sentence and the fix in one sentence. Evidence is shown as the exact quote with its source, with no summary around it.
- Placeholders name only what's missing and the row ID.
- Progress: one line ("34 of 60 fields done"), no running log.
- Empty states: one short line saying what to do next.

**Hierarchy on screen**
- The form is the hero: widest column, the largest text.
- The sidebar and right panel are secondary: smaller text, muted colour, collapsible.

## 6. Decided 07:06 (Calvin)
- A section redraft does **not** re-score related fields in other sections that feed the same criterion. Only the redrafted part is assessed. **Agreed**
- Reference applications and templates get their own last sidebar heading (§2). **Agreed**
- Progress line at the top of the right panel summary (§4 step 4). **Agreed**
- The government file is used exactly as it is, watermark included (§3). **Agreed**
- Settings holds the Microsoft account link, model keys and the threshold (§2). **Agreed**

## 7. Open
None in the UX spec. Backend technology decisions are next.
