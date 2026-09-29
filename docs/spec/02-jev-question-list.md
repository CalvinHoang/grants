# jev question list — CRC-P (v0.1)

Status: draft for Calvin's review · 2026-09-27 · Companion to `01-drafting-workflow-spec.md`

> **Superseded where it differs.** `05-build-spec.md` is the build source of truth (D1–D26). "jev" here means whichever model fills the decision-model role (spec 05 §8, §9.2); the questions don't change with the model.

Every question jev is asked in the workflow. Guideline wording in "quotes" is verbatim from the CRC-P Round 19 guidelines (`reference/crc-p/source/text/crcp-r19-guidelines.txt`). Requirement row IDs (for example `MC-4a.2`) are the rows of the requirements table: each row is one granular piece of guideline wording.

## How jev is asked

jev takes a **state** (the context we give it) and a **question**. It answers one of three ways: a probability that a statement is true, a choice from options we supply, or a score on a rubric. It writes no text. One request holds 64K tokens in total, with 32K for the state plus the longest question.

| Question family | jev type | Threshold | Asked when | Count (CRC-P) |
|---|---|---|---|---|
| P(compelling) | probability | ≥ 0.99 | 3 Assess, per merit requirement row | 30 |
| P(eligible) | probability | ≥ 0.99 | 3 Assess, per judgement eligibility row | 15 |
| Gap type | choice | confidence ≥ 0.99, else flag to advisor | 4 Decide, per row below threshold | 1 per gap |
| Digest | choice + probability | ≥ 0.99 | 1 Digest | per document / passage |

0.99 is a trial value everywhere (spec §5.0). Rule-checkable eligibility is done by code, not jev (§B.2, **Proposed**). Disclosures and declarations are never scored or inferred (§B.3).

---

## A. P(compelling) — 3 Assess

### A.1 State given to jev (same shape for every row)
1. **Criterion:** heading and points, for example "Impact of the grant funding on your project (25 points)".
2. **Requirement row:** the verbatim wording for this row, and the full sub-criterion it belongs to, with its points.
3. **General assessment guidance (verbatim, GL §6):** "The amount of detail and supporting evidence you provide in your application should be relative to the project size, complexity and grant amount requested. You should provide evidence to support your answers." · "We will only consider funding applications that are competitive against each assessment criterion."
4. **Draft:** the full criterion response (AF-I.x), plus the other form fields that feed this row (listed per row below).
5. **Evidence:** the digest table passages cited by the draft for this row.
6. **Reference:** the matching answer from the reference application, if one is provided.
7. **Project scale:** grant amount requested and project duration (so "relative to the project size" can be judged).

### A.2 Question template
> "An expert on the Cooperative Research Centres Advisory Committee, assessing this application against other applications, would find the draft's response to the requirement '[verbatim row wording]' compelling: specific, supported by evidence, quantified where possible, and competitive for the points available."

### A.3 Rows

**Criterion 1: "Project alignment with the program objectives (25 points)". Form: AF-I.1**

| Row | Verbatim wording (row) | Sub-criterion pts | Other fields in state |
|---|---|---|---|
| MC-1a.1 | "how your project will address an industry-identified problem" | 10 | G.2, G.3, G.5 |
| MC-1a.2 | "improve the competitiveness, productivity and sustainability of Australian industries" | 10 | G.3 |
| MC-1a.3 | "the extent of alignment with government priorities (refer to Appendix A)" | 10 | J.1, J.2, J.3, J.5 |
| MC-1b.1 | "how your project will foster high quality research through industry-led and outcome-focused collaborative industry-research partnerships" | 8 | F.4b (all partners), G.2 |
| MC-1c.1 | "how your project will encourage and facilitate SME participation" | 7 | F.4a/b |

MC-1a.3 also gets the Appendix A text in state (verbatim): "An application which strongly aligns with Government priorities will score higher in this part of the assessment criteria than an application which does not."

**Criterion 2: "The quality of your project (25 points)". Form: AF-I.2**

| Row | Verbatim wording (row) | Pts | Other fields in state |
|---|---|---|---|
| MC-2a.1 | "the research you will do and the methodologies you will use" | 10 | G.2, G.9 |
| MC-2a.2 | "describing the role of your partners in the project" | 10 | F.4b (all partners), G.4 |
| MC-2b.1 | "how your research will address the identified problem" | 8 | G.2, G.5 |
| MC-2b.2 | "build on the current body of knowledge" | 8 | G.5, G.6 |
| MC-2b.3 | "enhance the adoption of new technologies" | 8 | G.3, G.6 |
| MC-2c.1 | "the education and training opportunities your project will provide to build capability and capacity in the industry and research sectors" | 7 | G.2, G.9 |

**Criterion 3: "Capacity, capability and resources to deliver your project (25 points)". Form: AF-I.3**

| Row | Verbatim wording (row) | Pts | Other fields in state |
|---|---|---|---|
| MC-3a.1 | "how you will manage and monitor your project, explaining the governance and planning arrangements" | 8 | G.9, F.4b |
| MC-3a.2 | "including security" | 8 | G.13 |
| MC-3b.1 | "how you will manage risks" | 7 | G.2, G.9 |
| MC-3b.2 | "including but not limited to security (in particular any associated national security issues)" | 7 | G.12a–d, G.13 |
| MC-3b.3 | "involvement of international partners" | 7 | F.4a, G.12a–d |
| MC-3b.4 | "intellectual property protection" | 7 | J.7 |
| MC-3c.1 | "your access to required resources including personnel with the right skills and experience" | 10 | G.4 |
| MC-3c.2 | "funding" | 10 | F.2, H.1, H.2 |
| MC-3c.3 | "security, infrastructure, technology and intellectual property" | 10 | G.10, G.13, J.7 |

MC-3a.2 and MC-3b.2 also get the Glossary definition of "Security" in state (verbatim): "Measures taken to protect something, including governance, physical, information and personnel arrangements (e.g. vetting, access and planning)…"

**Criterion 4: "Impact of the grant funding on your project (25 points)". Form: AF-I.4**

| Row | Verbatim wording (row) | Pts | Other fields in state |
|---|---|---|---|
| MC-4a.1 | "how the grant will impact the project in terms of scale and timing" | 6 | G.8, G.9 |
| MC-4a.2 | "justification for the funding amount requested" | 6 | H.1, H.2 |
| MC-4a.3 | "whether the project could proceed without Australian Government funding" | 6 | H.2 |
| MC-4b.1 | "the total investment the grant will leverage" | 6 | F.2, H.1, H.2 |
| MC-4b.2 | "why the Australian Government should invest in your project" | 6 | G.3 |
| MC-4b.3 | "how grant benefits will be substantially retained in Australia" | 6 | G.10, J.7 |
| MC-4c.1 | "how your project will have a positive impact for communities and businesses in regional and remote Australia" | 4 | G.10 |
| MC-4d.1 | "the commercial potential of your project, including the expected commercial outputs such as new products, processes or services" | 9 | G.3, G.6 |
| MC-4d.2 | "any expected spill over benefits" | 9 | G.3 |
| MC-4d.3 | "plans at the end of the project" | 9 | G.3, G.9 |

MC-4c.1 also gets the Glossary definition of "Regional and remote Australia" in state.

Budget fields (F.2, H) are out of scope for drafting but appear in state where the criterion depends on them. If they're empty, jev scores without them, and the row's gap is likely an information gap.

### A.4 Merit wording that sits in narrative fields outside section I
AF-G.2 (project description) and AF-G.3 (outcomes) go into the grant agreement and feed several rows above. They get P(compelling) through the rows that list them, not a question of their own. **Proposed**

---

## B. P(eligible) — 3 Assess

### B.1 Judgement rows (jev)

**State:** the verbatim requirement row, the related Glossary definitions (verbatim), the digest table passages tagged to this row, and the related form fields (G.2 for EL-11 rows).

**Question template:**
> "Based on the evidence provided, the application meets this eligibility requirement as the Program Delegate would read it: '[verbatim row wording]'."

| Row | Verbatim wording (row) | Source | Form field |
|---|---|---|---|
| EL-00.1 | "Each CRC-P must be an industry-led collaboration with a SME lead applicant who is the main driver of the project." | GL §4.1 | G.2, F.4b |
| EL-04.1 | Lead is "an entity incorporated in Australia and a trading corporation, where your trading activities form a sufficiently significant proportion of the corporation's overall activities as to merit it being described as a trading corporation; or are a substantial and not merely peripheral activity of the corporation" | GL §4.1 | B.3 |
| EL-04.2 | Or lead is "an incorporated trustee on behalf of a trust" meeting the same trading test | GL §4.1 | B.3 |
| EL-05b.1 | Second partner is an "Australian industry entity": "An Australian business with an Australian Business Number whose trading activities are a substantial and not merely peripheral activity of the business" | Glossary | F.4a |
| EL-11.1 | "be a short term … collaborative research project" | GL §5.1 | G.2, G.8 |
| EL-11.2 | "industry-identified" | GL §5.1 | G.2, G.5 |
| EL-11.3 | "industry-led" | GL §5.1 | G.2, F.4b |
| EL-11.4 | "to develop a product, service or process that will solve problems for industry" | GL §5.1 | G.2, G.3 |
| EL-11.5 | "and deliver tangible outcomes" | GL §5.1 | G.3 |
| EL-11.6 | "benefit SMEs and increase their capacity to grow and adapt in changing markets" | GL §5.1 | G.3 |
| EL-11.7 | "include eligible activities", which "must directly relate to the project and must include at least one of the following: new research · proof of concept activities · pre-commercialisation of research outcomes · industry-focused education and training activities… · conferences, workshops, and/or symposia related to the joint research · information sharing and communication initiatives related to the joint research" | GL §5.1 | G.2, G.9 |
| EL-12.1 | Lead is not "a research organisation or an entity whose primary purpose is to undertake research" | GL §4.3 | B |
| EL-12.2 | Lead is not "an entity where the majority of your funding is from government grant programs" | GL §4.3 | B, J.6 |
| EL-12.3 | Lead is not "an entity whose primary purpose is administrative or to provide support services to a CRC-P" | GL §4.3 | B |
| EL-15.1 | Applicant, partners and activities comply with Australian sanctions (declaration AF-M.2(6)) | AF-M.2 | M.2 |

### B.2 Rule rows (code, not jev) — **Proposed**
These are arithmetic or lookups, so a model adds no value and adds risk: EL-01 ABN, EL-02 GST, EL-03 fewer than 200 employees (group total if consolidated), EL-05 minimum partner mix, EL-05a research organisation type (HESA Table A/B, MRI list; "CRCs are not considered research organisations"), EL-06 every partner contributes, EL-07 grant ≤ 50%, EL-08 $100k–$3M, EL-09 ≥ $200k, EL-10 ≤ 36 months, EL-12 entity-type exclusions (individual, sole trader, partnership, unincorporated association, trust, government body, non-corporate Commonwealth entity), EL-13 Redress Scheme list, EL-14 WGEA, EL-17 trust deed attached. Budget-based ones (EL-06 to EL-09) wait until budget is in scope.

### B.3 Never scored or inferred
Disclosures and declarations (AF-G.11 penalties, G.12a–d foreign affiliation, G.13 security plan, L.1 conflicts, M.2 declarations, F.4e partner confirmations, EL-16 board endorsement) are answered only from client confirmation. When one isn't confirmed, the result is always "RFI needed". Applicants make these statements under the Criminal Code. **Proposed**

---

## C. Style

Not scored by jev. Style review is done by the LLM only (spec §5.2b).

---

## D. Gap type — 4 Decide

**Asked for** each requirement row whose P(compelling) or P(eligible) is below 0.99.

**State:** the requirement row, the draft, jev's scores, the LLM's written explanation of what's weak or missing, the digest passages tagged to the row, and a note on whether the document search found anything new.

**Question:** "What is the main reason this draft falls short of the requirement?"

| Option | Meaning | Next move (set by code) |
|---|---|---|
| drafting | The evidence is in the digest table but unused or weakly phrased | Redraft |
| evidence | A claim is made but no passage supports it | Search the documents again, then redraft or flag RFI needed |
| information | No passage covers the requirement | Flag RFI needed |
| conflict | Documents or fields disagree | Flag advisor decision |
| eligibility | A gate fails, and drafting can't fix it | Stop, flag advisor |
| strategic | A framing choice only the advisor or client can make | Flag advisor decision |
| space | The row can't improve without taking characters from another row in the same box | Stop, flag advisor (out of space) |

"space" is added so the out-of-space stop condition has a jev decision behind it. **Proposed**

---

## E. Digest questions — 1 Digest

| ID | Type | State | Question |
|---|---|---|---|
| DG-1 Document type | choice | The document (or first 32K tokens) | "Which type of document is this?" Options: annual report / financial statements / BAS or tax record / company or ASIC extract / trust deed / business plan / project plan / technical report / CV or bio / letter of support or commitment / partner agreement or MOU / IP record (patent, licence) / market or industry report / email or meeting notes / other |
| DG-2 Split | (docjev split) | A bundled file | Split into separate documents with page ranges |
| DG-3 Party | choice | The document | "Which party does this document describe?" Options: lead applicant / industry partner [name] / research organisation [name] / multiple / none |
| DG-4 Supports | probability | One passage plus one requirement row (verbatim) | "This passage provides evidence for the requirement '[verbatim row wording]'." Links at ≥ 0.99 go into the digest table. Links between 0.5 and 0.99 are shown to the advisor as suggestions. **Proposed** (the 0.5 lower bound) |

The LLM finds candidate passages. jev confirms each passage-to-requirement link (DG-4). This follows TypeSafe's recommended pattern: the LLM extracts and jev verifies.

---

## G. Overall probabilities (right panel summary) — **Proposed**

Shown above the Issues list when nothing is selected (spec 03 §2). Two whole-application questions, asked after each assessment pass:

| ID | Question | State given to jev |
|---|---|---|
| OV-C | "An expert on the CRC Advisory Committee, comparing this application with others in the round, would find it compelling overall." | All written answers in section I plus the merit criteria wording and weightings |
| OV-E | "This application meets every CRC-P eligibility requirement." | The eligibility wording, the code rule results (B.2) and the answers the judgement rows (B.1) looked at |

Asked as questions rather than computed from the row scores, because there is no sound way to combine 30 row probabilities into one. The written answers are character-limited, so they fit in jev's 32K state.

## F. Counts for one CRC-P application (rough)

30 compelling + 15 eligibility + 2 overall + gap types as needed + about 200 to 1,000 DG-4 checks, depending on the size of the client folder. That's about 47 questions per assessment pass, plus the digest checks. At TypeSafe's published pricing ($0.042 per million input tokens, output free), jev cost is negligible. The LLM calls are the cost that matters.
