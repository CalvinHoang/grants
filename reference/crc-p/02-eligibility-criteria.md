# CRC-P Round 19 — eligibility gates, priority flags, disclosures

"We cannot waive the eligibility criteria under any circumstances" (GL §4.2). A fail on any `EL-` item = application not assessed. Most are checkable by rules from structured data; the tool should check them deterministically, not with a model.

## Hard eligibility gates (EL)

| Ref | Requirement | Source | Form field | Check type | Client evidence needed |
|---|---|---|---|---|---|
| EL-01 | Lead applicant holds an ABN | GL §4.1 | AF-F.1 | Rule (ABN lookup) | ABN |
| EL-02 | Lead applicant registered for GST | GL §4.1 | AF-B.2 | Rule (ABN Lookup shows GST) | ABN Lookup record |
| EL-03 | Lead applicant is an SME (<200 employees headcount) at lodgement; if in a tax consolidated group, whole group <200 | GL §4.1, Glossary | AF-B.1, AF-E.1 | Rule | Headcount, group structure, consolidated group status |
| EL-04 | Lead is (a) incorporated in Australia and a trading corporation (trading activities substantial, not peripheral) or (b) an incorporated trustee for a trust meeting the same trading test | GL §4.1 | AF-B.3 | Rule + advisor judgement for trading test | Company extract (ASIC), revenue mix, trust deed if (b) |
| EL-05 | Minimum partners: lead SME (Australian industry entity) + second Australian industry entity (any size) + Australian research organisation. Must be maintained during project. | GL §4.1 | AF-B.4, AF-F | Rule | Partner list with ABNs and entity types |
| EL-05a | "Research organisation" = HESA Table A/B higher education providers, corporate Commonwealth entities and state/territory business enterprises doing publicly funded research, and Medical Research Institutes (ACNC-registered). **CRCs do not count.** | Glossary | AF-F.4 partner type | Rule | Research partner identity |
| EL-05b | "Australian industry entity" = Australian business with ABN whose trading is substantial; excludes research orgs, admin/support entities, government bodies. Includes sole traders, partnerships, cooperatives and companies. No minimum size or operating period, but must be active and operating in Australia (FAQ) | Glossary | AF-F | Rule + judgement | Second industry partner details |
| EL-06 | Every partner contributes cash, cash-staff and/or in-kind (guidelines: "cash and/or in-kind"; form adds cash-staff). Partners need not commit for the whole project period | GL §4.1 | AF-F.2 | Rule | Contribution per partner per FY |
| EL-07 | Grant ≤ 50% of total eligible project expenditure; partner contributions ≥ grant | GL §3.1, App B | AF-B.5, AF-H.2 | Rule (workbook) | Budget |
| EL-08 | Grant between $100,000 and $3,000,000 | GL §3.1 | AF-H.2 | Rule | Budget |
| EL-09 | Total eligible project value ≥ $200,000 | GL §5.1 | AF-B.6, AF-H.1 | Rule | Budget |
| EL-10 | Project period ≤ 36 months, within guideline dates | GL §3.2 | AF-G.8 | Rule | Start/end dates |
| EL-11 | Project is short-term, industry-identified, industry-led collaborative research to develop a product, service or process that solves problems for industry and delivers tangible outcomes; benefits SMEs; includes ≥1 eligible activity (new research, proof of concept, pre-commercialisation, industry-focused education/training, conferences/workshops, information sharing) | GL §5.1 | AF-G.2 | Advisor/AI judgement | Project description |
| EL-12 | Lead is not: non-SME, individual, sole trader, partnership, research organisation or entity whose primary purpose is research, unincorporated association, trust (unless incorporated trustee), any level of government or GBE, majority-funded by government grant programs, admin/support entity for a CRC-P, non-corporate Commonwealth entity, or "any other organisation not included in section 4.1" | GL §4.3 | AF-B | Rule + judgement | Entity type, funding sources |
| EL-13 | No partner on the National Redress Scheme non-joined institutions list | GL §4.3, AF-M.2(4) | Declaration | Rule (list lookup) | Partner names |
| EL-14 | Neither the applicant nor any partner is "an employer of 100 or more employees that has not complied with the Workplace Gender Equality Act (2012)" (the form's declaration covers only the applicant being named by WGEA) | GL §4.3, AF-M.2(5) | Declaration | Rule (list lookup) | Headcount, WGEA status |
| EL-15 | Applicant, partners and activities comply with Australian sanctions | AF-M.2(6) | Declaration | Rule + judgement | Partner countries, activities |
| EL-16 | Project and expenditure endorsed by lead's board/management committee or authorised person | AF-M.2(2) | Declaration | Client confirmation | Board minute / approval (keep on file; not attached) |
| EL-17 | Trust deed attached if applying as trustee | GL §4.2, §7.1 | AF-L.2 | Rule | Trust deed → ATT-01 |
| EL-18 | Every partner confirms awareness of guidelines, intent to sign partners agreement, commitment of contributions, awareness of clinical-trial expenditure rules | AF-F.4 | Checkbox per partner | Client confirmation | Partner sign-off (email/letter kept on file) |

## Priority flags (PR) — not eligibility, affect ranking

| Ref | Flag | Source | Form field | Evidence |
|---|---|---|---|---|
| PR-01 | Aboriginal and Torres Strait Islander organisation (ICN or Supply Nation registered) prioritised | GL §1.1, §4.2, §8.2 | AF-J.4 | ICN or Supply Nation registration → ATT-02 |
| PR-02 | AI Accelerator: develops/enhances AI in healthcare, agriculture, resources & energy, advanced manufacturing | GL App A.1 | AF-J.1 (500 chars) | Description of AI component |
| PR-03 | NRF priority alignment (primary/secondary); ~20% funding cap per area for non-AI, non-Indigenous apps | GL §8.2, App A.2 | AF-J.2 | Rationale |
| PR-04 | Science & Research Priority alignment (primary/secondary) | App A.3 | AF-J.3 | Rationale |
| PR-05 | Other government priorities (up to 3) + basis (report/statement) | Glossary | AF-J.5 | Citation of policy document |
| PR-06 | Regional/remote benefit (also scored in MC-4c); project site locations | Glossary, App | AF-G.10 | Street addresses, ASGS remoteness |

## Due-diligence disclosures (DD) — not scored, but feed due diligence and MC-3a/3b; wrong answers are a fraud risk

| Ref | Disclosure | Source | Form field |
|---|---|---|---|
| DD-01 | Pecuniary penalties on board/management/persons of authority | GL §13.7 | AF-G.11 |
| DD-02 | Foreign funding/non-financial support to project | GL §13.6.3 | AF-G.12a |
| DD-03 | Foreign financial support/benefits to entities or key personnel | GL §13.6.3–4 | AF-G.12b |
| DD-04 | Current/former foreign talent program association | GL §13.6.4 | AF-G.12c |
| DD-05 | Ties to foreign government, military or SOE | GL §13.6.4 | AF-G.12d |
| DD-06 | Security plan exists (cyber, data handling, national security); may be requested later | GL §13.6, AF | AF-G.13 |
| DD-07 | Conflicts of interest + management | GL §13.2 | AF-L.1 |
| DD-08 | Other Commonwealth/state government assistance in past 5 years that helped develop this project, and results | AF | AF-J.6 |
| DD-09 | Export controls (DSGL) applicability | GL §13.6.2 | (no field; address in MC-3b) |
| DD-10 | Know-your-partner due diligence on all partners and personnel | GL §13.6.1 | (no field; address in MC-3b) |
| DD-11 | Working with children obligations | AF-M.2(11) | Declaration |
