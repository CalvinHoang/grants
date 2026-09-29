# What the research changes about the proposed workflow

Calvin asked for the workflow and assertions to be challenged once research was done. Recommendations first, open questions at the end.

## 1. There are almost no "required supporting files"
CRC-P R19 asks for only two conditional attachments (trust deed if a trustee; ICN/Supply Nation evidence to claim Indigenous priority) and says it **ignores** anything else attached. So the deliverables are:
1. the **application form draft** (~60 fields, ~35k chars of narrative), and
2. the **Financial Workbook** populated (budget and contributions),
3. the **RFI** back to the client.
Letters of support, CVs, market reports etc. are *inputs* the tool mines for evidence, never outputs. **Recommendation:** drop "draft required supporting files" from v1; add optional advisory outputs (partners-agreement heads of terms, security plan outline) later.

## 2. Character limits are the hard constraint, not templates
Each merit criterion is one plain-text 5,000-char box covering 3–4 sub-criteria. The drafter must write to a per-sub-criterion budget and the reviewer must segment the box by sub-criterion. **Recommendation:** the review panel scores at the sub-criterion level (`MC-1a`…`MC-4d`, 11 items) with live char counts, not per form section.

## 3. Split checks into rules vs judgement
About half the requirements (all `EL-` gates except EL-11, all `BR-` budget rules, milestone counts, dates, site %) are arithmetic or lookups. An AI model should not be deciding them. **Recommendation:** a deterministic validator over structured data (mostly from the workbook) and model evaluation only for narrative quality and consistency.

## 4. "Strength" can only be a proxy
The committee publishes weights but no scoring scale, and ranks **comparatively** against other applications plus "value with money". An absolute score from a classifier will look more precise than it is. **Recommendation:** a rubric-based evaluator that, per sub-criterion, reports: covered / partly / missing, which evidence it relied on (citing the client doc), what's unquantified, and a concrete fix; show a banded rating (e.g. weak / competitive / strong) rather than a points estimate. Calibrate against real funded/unfunded applications if the advisor has them.

## 5. Cross-field consistency is where applications fail quietly
The same facts appear in many places: partners (F, I.1, I.2, I.3), milestones (G.9 vs I.2), TRL (G.6 vs I.2/I.4), IP (J.7 vs I.3), priorities (J.2–J.5 vs I.1), personnel (G.4 vs I.3), budget (H vs I.4 leverage), security (G.13 vs I.3). G.2 and G.3 go verbatim into the grant agreement. **Recommendation:** the evaluator includes a consistency pass across fields, not just per-section strength.

## 6. Several of the listed advisor topics aren't criteria
TRL, IP, foreign affiliation and Indigenous engagement are form fields/disclosures that feed criteria (mostly MC-3b/3c). Commercialisation is MC-4d (9 pts, among the heaviest). See the mapping table in `03-merit-criteria.md`. Structuring the tool by the 11 sub-criteria plus the form fields avoids double-work.

## 7. Grant knowledge must be versioned by round
R19 introduced the AI Accelerator and a per-NRF-area cap; the field list and FYs change each round. Round 20 is reportedly due late 2026 (unverified). **Recommendation:** store as `CRC-P / R19`, with a diff step when R20 guidelines publish, and keep reference IDs stable across rounds.

## 8. The RFI is multi-party
Information comes from the lead SME, the industry partner(s) and the research organisation, and some items need each partner's authorised sign-off. **Recommendation:** RFI grouped by party, each item linked to the criterion/field it unblocks and flagged blocking (eligibility) vs strengthening (merit).

## 9. Disclosures carry legal risk
Declarations are made under the Criminal Code; foreign-affiliation and penalty answers feed due diligence. **Recommendation:** the tool never infers "No" on a disclosure from silence in the documents; those always go to the RFI as client confirmations.

## 10. Client documents are commercially sensitive
Folders will contain financials, IP and personnel data for several organisations. Worth deciding early where documents are stored and processed and who can see each client's workspace.

## Open questions for Calvin
1. What is "classification model jev"? (e.g. a specific evaluator/judge model you have in mind, or a scoring approach?)
2. "RSP-R" — is that the name of the product/project, or a separate program? I found no program by that name; the one hit was the Department of Education's Research Support Program (university block grants), which I assume is not relevant.
3. Does the advisor have past CRC-P applications (funded and unfunded) we can use to calibrate the evaluator?
4. Should v1 target the Round 19 form as the template, or wait for Round 20 guidelines?

## Answers from Calvin (2026-09-27)
1. "jev" is an AI classification model; which one to use is an architecture decision for the spec phase.
2. "RSP-R" was the project name (since renamed); CRC-P is the target grant.
3. Reference applications are optional inputs: if the user provides them, the reviewer can refer to them.
4. It's a platform for all grant work, not tied to a round. CRC-P is the first grant because it's the simplest to build.
