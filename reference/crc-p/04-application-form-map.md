# CRC-P Round 19 — sample application form map

Online form on the business.gov.au portal. All text fields are plain text, **no formatting**, limits are **characters including spaces**. This is the "reference format" the drafter must output to.

Legend: **Draft** = narrative the tool drafts · **Data** = structured value from client docs · **Confirm** = client yes/no or declaration · **Rule** = validated by rules.

| Ref | Section / field | Limit / type | Kind | Feeds |
|---|---|---|---|---|
| AF-A.1 | Program selection | dropdown | Data | — |
| AF-B.1 | SME at lodgement? | Yes req. | Confirm/Rule | EL-03 |
| AF-B.2 | Registered for GST? | Yes req. | Confirm/Rule | EL-02 |
| AF-B.3 | Entity type (trading corp / incorporated trustee) | Yes req. | Confirm/Rule | EL-04 |
| AF-B.4 | Minimum partner composition | Yes req. | Confirm/Rule | EL-05 |
| AF-B.5 | Grant ≤50% of eligible project expenditure | Yes req. | Rule | EL-07 |
| AF-B.6 | Total eligible project value ≥$200k | Yes req. | Rule | EL-09 |
| AF-C.1–2 | Street and postal address | address | Data | — |
| AF-D | Primary contact; authorised signatory (name, phone, email, relationship) | fields | Data | — |
| AF-E.1 | Latest completed FY (or months to date); turnover (BAS), export revenue (BAS), R&D expenditure, taxable income, employees headcount, independent contractors | whole numbers | Data | EL-03 |
| AF-E.2 | ANZSIC division and class | dropdown | Data | — |
| AF-E.3 | Indigenous owned (≥51% members)? Indigenous controlled (≥51% board)? | Y/N | Confirm | PR-01 |
| AF-F.1 | Each partner ABN → validated entity name | ABN | Data/Rule | EL-01, EL-05 |
| AF-F.2 | Each partner contributions: cash, staff (cash-staff), in-kind × FY 2026/27–2029/30 + description | $ table | Data/Rule | EL-06, EL-07 |
| AF-F.3 | Financial Workbook (recommended, not uploaded) | xlsx offline | Data/Rule | BR-xx |
| AF-F.4a | Partner: name, authorised rep, position, addresses, phone, email, type (Large industry / SME / Research org / Other) | fields | Data | EL-05 |
| AF-F.4b | "Partner's involvement in the CRC-P": role and involvement, and how it provides contributions, **plus AF-F.4c, in one response** | 1,000 total | Draft | MC-1b, MC-2a |
| AF-F.4c | Partner company structure and relationships with other partners (related entities, same ultimate holding company, common directors, common major shareholders). Shares AF-F.4b's single 1,000-char limit ("Your partner involvement response is limited to 1000 characters") | within AF-F.4b | Draft | MC-3a, DD |
| AF-F.4d | Partner Indigenous owned / controlled | Y/N | Confirm | PR-01 |
| AF-F.4e | Partner confirmations (4 statements) | checkbox | Confirm | EL-18 |
| AF-G.1a | Project title | 75 | Draft | published |
| AF-G.1b | Brief project description for publication | 750 | Draft | published on GrantConnect |
| AF-G.2 | Detailed project description and key activities (scope, activities, implementation) — **goes into grant agreement** | 5,000 | Draft | EL-11, MC-2a |
| AF-G.3 | Project outcomes, referencing grant objectives — **goes into grant agreement** | 5,000 | Draft | MC-1, MC-4 |
| AF-G.4 | Key personnel, up to 3: title, name, organisation, position, project role | role 75 | Data | MC-3c |
| AF-G.5 | Industry context: national/international state of play in the research area | 2,000 | Draft | MC-1a, MC-2b |
| AF-G.6 | Starting TRL and target TRL (1–9; sector scale allowed; can be equal) | numbers | Data | MC-2b, MC-4d |
| AF-G.7 | Working with Indigenous communities? If yes, how (research, consultation, Traditional and Cultural Knowledge) | Y/N + 2,000 | Confirm/Draft | PR, compliance |
| AF-G.8 | Start date, end date, duration months (≤36) | dates | Data/Rule | EL-10 |
| AF-G.9 | Milestones: **3–10**, each title (100), description (750), start, end, within project dates | table | Draft/Rule | MC-2a, grant agreement |
| AF-G.10 | Project sites: street address (not postal, institution or building name) + estimated % of project value per site | address + % (sum to 100 *inferred*) | Data/Rule | MC-4c |
| AF-G.11 | Pecuniary penalties? If yes details | Y/N + 750 | Confirm | DD-01 |
| AF-G.12a–d | Foreign support to project; foreign support to entities/personnel; foreign talent programs; ties to foreign gov/military/SOE — each Y/N + 750 | Y/N + 750 ×4 | Confirm/Draft | DD-02–05 |
| AF-G.13 | Security plan in place? (cyber, data handling; may be requested) | Y/N | Confirm | DD-06, MC-3a |
| AF-H.1 | Eligible expenditure by head × FY: audit (≤1%), capital, consumables, contractors, IP & technology, labour incl. on-costs, other, overseas (≤10%), travel (≤10%), in-kind; + "other" details (750), in-kind details (750). GST-exclusive if registered, inclusive if not. FYs shown follow the project dates (sample shows 2026/27–2029/30). | $ table | Data/Rule | BR-xx |
| AF-H.2 | Grant amount sought (≤50%) | $ | Data/Rule | EL-07, EL-08 |
| AF-I.1 | Criterion 1 response | 5,000 | Draft | MC-1a–c |
| AF-I.2 | Criterion 2 response | 5,000 | Draft | MC-2a–c |
| AF-I.3 | Criterion 3 response | 5,000 | Draft | MC-3a–c |
| AF-I.4 | Criterion 4 response | 5,000 | Draft | MC-4a–d |
| AF-J.1 | AI systems/technologies? If yes, explain | Y/N + 500 | Draft | PR-02 |
| AF-J.2 | NRF priority area primary / secondary | dropdowns | Data | PR-03, MC-1a |
| AF-J.3 | Science & Research Priority primary / secondary | dropdowns | Data | PR-04, MC-1a |
| AF-J.4 | ATSI organisation with ICN / Supply Nation? If yes upload evidence | Y/N + upload | Confirm | PR-01, ATT-02 |
| AF-J.5 | Other government priorities (up to 3) + basis | 300 + 300 | Draft | PR-05 |
| AF-J.6 | Other government assistance last 5 years: source (500), dates, amount, details, results (500) | Y/N + fields | Data/Draft | DD-08 |
| AF-J.7 | IP category: applicant owns / licensed from third party / third party will license or assign / N/A | dropdown | Data | MC-3b/3c |
| AF-K | Bank account (name, BSB, number); payment contact | fields | Data | — |
| AF-L.1 | Conflicts of interest? description (750) + management (750) | Y/N + text | Confirm/Draft | DD-07 |
| AF-L.2 | Attachments (see file 06) | upload | — | ATT |
| AF-L.3 | Program feedback | dropdowns | — | — |
| AF-M.1–2 | Privacy acknowledgement; 13 declarations (read guidelines; **board endorsement**; comply with laws; Redress Scheme; WGEA; **sanctions**; accurate info — Criminal Code; verification; evaluation; electronic; working with children; consequences; authorised to submit) | checkbox | Confirm | EL-13–16, DD-11 |

**Narrative drafting load:** ~33,000+ characters of core narrative (G.2, G.3, I.1–I.4 at 5,000 each; G.5 2,000; G.1b 750; milestones up to 10×850; 1,000 per partner).
