// CRC-P Round 19 requirement rows: the source of requirements-table.xlsx and of the
// per-row entries in questions.json.
//
// `wording` is copied from the government text named by `source` and is checked by
// check.mjs against reference/crc-p/source/text/ (whitespace and list markers
// normalised, nothing else). Line breaks in `wording` stand for list items in the
// original. `context` is the verbatim lead-in sentence the row sits under; it is
// checked the same way and goes into the decision model's state, not the table.
//
// source: "GL" = crcp-r19-guidelines.txt · "AF" = crcp-r19-sample-application.txt
//
// family:
//   compelling — merit row, P(compelling) (spec 02 §A)
//   eligible   — judgement eligibility row, P(eligible) (spec 02 §B.1)
//   rule       — checked by code (rules.json, spec 02 §B.2)
//   confirm    — declaration or disclosure, never scored or inferred (spec 02 §B.3)
//   priority   — government-priority wording a field is drafted against; not scored
//   form       — the form's own prompt, for a drafted field no guideline row covers; not scored
//
// statement: how the decision model is asked an eligible row whose wording is a fragment
//            ("The lead applicant is not {row}"); default: the quoted wording.
// anyOf:     rows that are alternatives (EL-04: company or incorporated trustee); the
//            requirement is met when any row in the group reaches the threshold.

const AF = 'Application form';

export const criteria = [
  {
    id: 'MC-1', field: 'AF-I.1', points: 25, ref: 'GL §6.1',
    heading: 'Project alignment with the program objectives (25 points)',
    subcriteria: [
      { id: 'MC-1a', points: 10, wording: 'how your project will address an industry-identified problem, improve the competitiveness, productivity and sustainability of Australian industries and the extent of alignment with government priorities (refer to Appendix A) (10 points)' },
      { id: 'MC-1b', points: 8, wording: 'how your project will foster high quality research through industry-led and outcome-focused collaborative industry-research partnerships (8 points)' },
      { id: 'MC-1c', points: 7, wording: 'how your project will encourage and facilitate SME participation (7 points).' },
    ],
  },
  {
    id: 'MC-2', field: 'AF-I.2', points: 25, ref: 'GL §6.2',
    heading: 'The quality of your project (25 points)',
    subcriteria: [
      { id: 'MC-2a', points: 10, wording: 'the research you will do and the methodologies you will use, including describing the role of your partners in the project (10 points)' },
      { id: 'MC-2b', points: 8, wording: 'how your research will address the identified problem, build on the current body of knowledge and enhance the adoption of new technologies (8 points)' },
      { id: 'MC-2c', points: 7, wording: 'the education and training opportunities your project will provide to build capability and capacity in the industry and research sectors (7 points).' },
    ],
  },
  {
    id: 'MC-3', field: 'AF-I.3', points: 25, ref: 'GL §6.3',
    heading: 'Capacity, capability and resources to deliver your project (25 points)',
    subcriteria: [
      { id: 'MC-3a', points: 8, wording: 'how you will manage and monitor your project, explaining the governance and planning arrangements, including security (8 points)' },
      { id: 'MC-3b', points: 7, wording: 'how you will manage risks, including but not limited to security (in particular any associated national security issues), involvement of international partners and intellectual property protection (7 points)' },
      { id: 'MC-3c', points: 10, wording: 'your access to required resources including personnel with the right skills and experience, funding, security, infrastructure, technology and intellectual property (10 points).' },
    ],
  },
  {
    id: 'MC-4', field: 'AF-I.4', points: 25, ref: 'GL §6.4',
    heading: 'Impact of the grant funding on your project (25 points)',
    subcriteria: [
      { id: 'MC-4a', points: 6, wording: 'how the grant will impact the project in terms of scale and timing. This should include justification for the funding amount requested and whether the project could proceed without Australian Government funding (6 points)' },
      { id: 'MC-4b', points: 6, wording: 'the total investment the grant will leverage and why the Australian Government should invest in your project, including how grant benefits will be substantially retained in Australia (6 points)' },
      { id: 'MC-4c', points: 4, wording: 'how your project will have a positive impact for communities and businesses in regional and remote Australia (4 points)' },
      { id: 'MC-4d', points: 9, wording: 'the commercial potential of your project, including the expected commercial outputs such as new products, processes or services, any expected spill over benefits and plans at the end of the project (9 points).' },
    ],
  },
];

// Merit rows (spec 02 §A.3). stateFields = "Other fields in state".
const merit = [
  ['MC-1a.1', 'how your project will address an industry-identified problem', ['AF-G.2', 'AF-G.3', 'AF-G.5'], 'The industry problem or opportunity, who identified it, and its size or cost to the industry (market data, customer feedback, industry reports)'],
  ['MC-1a.2', 'improve the competitiveness, productivity and sustainability of Australian industries', ['AF-G.3'], 'How the project improves competitiveness, productivity and sustainability, quantified where possible (business plan, market research)'],
  ['MC-1a.3', 'the extent of alignment with government priorities (refer to Appendix A)', ['AF-J.1.2', 'AF-J.2', 'AF-J.3', 'AF-J.5'], 'Which government priorities the project serves and the mechanism (AI Plan, NRF area, Science and Research Priority, other policy)'],
  ['MC-1b.1', 'how your project will foster high quality research through industry-led and outcome-focused collaborative industry-research partnerships', ['AF-F.4b', 'AF-G.2'], 'How the lead drives the research, the research questions, why this research partner, co-design history and prior collaboration outputs (proposal, MoUs, prior project reports)'],
  ['MC-1c.1', 'how your project will encourage and facilitate SME participation', ['AF-F.4a', 'AF-F.4b'], 'How SMEs take part in and benefit from the project, partners and wider SME base, with numbers (supply-chain or customer lists)'],
  ['MC-2a.1', 'the research you will do and the methodologies you will use', ['AF-G.2', 'AF-G.9'], 'Research plan: work packages, methods, milestones and timeline (research proposal, project plan, Gantt)'],
  ['MC-2a.2', 'describing the role of your partners in the project', ['AF-F.4b', 'AF-G.4'], 'Each partner\'s role per work package (research proposal, project plan)'],
  ['MC-2b.1', 'how your research will address the identified problem', ['AF-G.2', 'AF-G.5'], 'How the research solves the problem (research proposal, technical reports)'],
  ['MC-2b.2', 'build on the current body of knowledge', ['AF-G.5', 'AF-G.6.1', 'AF-G.6.2'], 'State of the art nationally and internationally, the gap and the novelty (literature review, patent search)'],
  ['MC-2b.3', 'enhance the adoption of new technologies', ['AF-G.3', 'AF-G.6.1', 'AF-G.6.2'], 'Adoption pathway, starting and target TRL with evidence (prototype, trial results)'],
  ['MC-2c.1', 'the education and training opportunities your project will provide to build capability and capacity in the industry and research sectors', ['AF-G.2', 'AF-G.9'], 'Students, interns, secondments, industry staff training and workshops, with numbers and timing (research organisation proposal, HR plans)'],
  ['MC-3a.1', 'how you will manage and monitor your project, explaining the governance and planning arrangements', ['AF-G.9', 'AF-F.4b'], 'Governance: steering committee, project manager, reporting cadence, decision-making and planning (governance plan, org chart)'],
  ['MC-3a.2', 'including security', ['AF-G.13'], 'Security arrangements in governance: physical, information and personnel (security plan)'],
  ['MC-3b.1', 'how you will manage risks', ['AF-G.2', 'AF-G.9'], 'Risk register: technical, commercial and partner risks with mitigations'],
  ['MC-3b.2', 'including but not limited to security (in particular any associated national security issues)', ['AF-G.12a.1', 'AF-G.12b.1', 'AF-G.12c.1', 'AF-G.12d.1', 'AF-G.13'], 'National security, export control (DSGL), cyber and data risks and mitigations (security plan, risk register)'],
  ['MC-3b.3', 'involvement of international partners', ['AF-F.4a', 'AF-G.12a.1', 'AF-G.12b.1', 'AF-G.12c.1', 'AF-G.12d.1'], 'International partners or personnel, their role, and how the risk is managed (partner list, know-your-partner checks)'],
  ['MC-3b.4', 'intellectual property protection', ['AF-J.7'], 'IP strategy: background and foreground IP, ownership, protection (IP register, partner agreement heads of terms)'],
  ['MC-3c.1', 'your access to required resources including personnel with the right skills and experience', ['AF-G.4'], 'Named key personnel with skills and track record (CVs, bios)'],
  ['MC-3c.2', 'funding', ['AF-F.2', 'AF-H.1', 'AF-H.2'], 'Confirmed source of each partner\'s cash and contributions (financial statements, board papers)'],
  ['MC-3c.3', 'security, infrastructure, technology and intellectual property', ['AF-G.10', 'AF-G.13', 'AF-J.7'], 'Named facilities, equipment, technology and IP access (equipment lists, IP register)'],
  ['MC-4a.1', 'how the grant will impact the project in terms of scale and timing', ['AF-G.8', 'AF-G.9'], 'Effect of the grant on scale and timing versus a scenario without it (board papers, project plan)'],
  ['MC-4a.2', 'justification for the funding amount requested', ['AF-H.1', 'AF-H.2'], 'Budget and why this amount (budget, board papers)'],
  ['MC-4a.3', 'whether the project could proceed without Australian Government funding', ['AF-H.2'], 'The counterfactual without the grant (board papers)'],
  ['MC-4b.1', 'the total investment the grant will leverage', ['AF-F.2', 'AF-H.1', 'AF-H.2'], 'Total partner investment and leverage ratio (financial workbook)'],
  ['MC-4b.2', 'why the Australian Government should invest in your project', ['AF-G.3'], 'National benefit case: jobs, production, capability (business plan)'],
  ['MC-4b.3', 'how grant benefits will be substantially retained in Australia', ['AF-G.10', 'AF-J.7'], 'Australian jobs, manufacturing and IP ownership retained onshore (business plan, IP strategy)'],
  ['MC-4c.1', 'how your project will have a positive impact for communities and businesses in regional and remote Australia', ['AF-G.10'], 'Regional or remote sites, customers, suppliers and communities that benefit, with locations (site list, customer list)'],
  ['MC-4d.1', 'the commercial potential of your project, including the expected commercial outputs such as new products, processes or services', ['AF-G.3', 'AF-G.6.1', 'AF-G.6.2'], 'Commercial outputs, target customers, market size, pricing and revenue (business plan, commercial model, sales pipeline)'],
  ['MC-4d.2', 'any expected spill over benefits', ['AF-G.3'], 'Spill-over benefits to other firms, sectors or regions (business plan, market reports)'],
  ['MC-4d.3', 'plans at the end of the project', ['AF-G.3', 'AF-G.9'], 'Post-project commercialisation plan and funding (business plan)'],
];

const subOf = (rowId) => rowId.replace(/\.\d+$/, '');
const critOf = (rowId) => rowId.slice(0, 4);

export const rows = [
  ...merit.map(([id, wording, stateFields, items]) => {
    const c = criteria.find((x) => x.id === critOf(id));
    const s = c.subcriteria.find((x) => x.id === subOf(id));
    return {
      id, family: 'compelling', source: 'GL', ref: c.ref, wording,
      fields: [c.field], stateFields, items,
      criterion: c.id, subcriterion: s.id, points: s.points,
    };
  }),

  // Judgement eligibility rows (spec 02 §B.1)
  { id: 'EL-00.1', family: 'eligible', source: 'GL', ref: 'GL §4.1',
    wording: 'Each CRC-P must be an industry-led collaboration with a SME lead applicant who is the main driver of the project.',
    fields: ['AF-G.2', 'AF-F.4b'], items: 'Who drives the project and the lead SME\'s role and decision rights' },
  { id: 'EL-04.1', family: 'eligible', statement: 'The lead applicant is {row}', anyOf: 'EL-04', source: 'GL', ref: 'GL §4.1',
    context: 'and be one of the following entities:',
    wording: 'an entity incorporated in Australia and a trading corporation, where your trading activities\nform a sufficiently significant proportion of the corporation’s overall activities as to merit it being described as a trading corporation; or\nare a substantial and not merely peripheral activity of the corporation.',
    fields: ['AF-B.3'], glossary: ['Trading activity'],
    items: 'Company extract (ASIC); revenue mix showing trading activity is substantial (financial statements)' },
  { id: 'EL-04.2', family: 'eligible', statement: 'The lead applicant is {row}', anyOf: 'EL-04', source: 'GL', ref: 'GL §4.1',
    context: 'and be one of the following entities:',
    wording: 'an incorporated trustee on behalf of a trust where your trading activities\nform a sufficiently significant proportion of the corporation’s overall activities as to merit it being described as a trading corporation; or\nare a substantial and not merely peripheral activity of the corporation.',
    fields: ['AF-B.3'], glossary: ['Incorporated Trustee', 'Trading activity'],
    items: 'Trust deed and trustee details; revenue mix of the trust (financial statements)' },
  { id: 'EL-05b.1', family: 'eligible', statement: 'The second Australian industry entity partner is {row}', source: 'GL', ref: 'GL Glossary',
    wording: 'An Australian business with an Australian Business Number whose trading activities are a substantial and not merely peripheral activity of the business',
    fields: ['AF-F.4a'], glossary: ['Australian industry entity'],
    items: 'Second industry partner: ABN, what it trades in, evidence it is active and operating in Australia' },
  { id: 'EL-11.1', family: 'eligible', source: 'GL', ref: 'GL §5.1',
    context: 'be a short term, industry-identified and industry-led collaborative research project to develop a product, service or process that will solve problems for industry and deliver tangible outcomes',
    wording: 'be a short term, industry-identified and industry-led collaborative research project',
    fields: ['AF-G.2', 'AF-G.8'], items: 'Project description showing short-term joint research between the partners, and its duration' },
  { id: 'EL-11.2', family: 'eligible', source: 'GL', ref: 'GL §5.1',
    context: 'be a short term, industry-identified and industry-led collaborative research project to develop a product, service or process that will solve problems for industry and deliver tangible outcomes',
    wording: 'industry-identified', fields: ['AF-G.2', 'AF-G.5'], items: 'Who in industry identified the problem, and how' },
  { id: 'EL-11.3', family: 'eligible', source: 'GL', ref: 'GL §5.1',
    context: 'be a short term, industry-identified and industry-led collaborative research project to develop a product, service or process that will solve problems for industry and deliver tangible outcomes',
    wording: 'industry-led', fields: ['AF-G.2', 'AF-F.4b'], items: 'Who drives the project; the lead SME\'s role' },
  { id: 'EL-11.4', family: 'eligible', source: 'GL', ref: 'GL §5.1',
    context: 'be a short term, industry-identified and industry-led collaborative research project to develop a product, service or process that will solve problems for industry and deliver tangible outcomes',
    wording: 'to develop a product, service or process that will solve problems for industry',
    fields: ['AF-G.2', 'AF-G.3'], items: 'The product, service or process to be developed and the industry problem it solves' },
  { id: 'EL-11.5', family: 'eligible', source: 'GL', ref: 'GL §5.1',
    context: 'be a short term, industry-identified and industry-led collaborative research project to develop a product, service or process that will solve problems for industry and deliver tangible outcomes',
    wording: 'deliver tangible outcomes', fields: ['AF-G.3'], items: 'Measurable outcomes the project will deliver' },
  { id: 'EL-11.6', family: 'eligible', source: 'GL', ref: 'GL §5.1',
    wording: 'benefit SMEs and increase their capacity to grow and adapt in changing markets',
    fields: ['AF-G.3'], items: 'Which SMEs benefit and how their capacity to grow and adapt increases' },
  { id: 'EL-11.7', family: 'eligible', source: 'GL', ref: 'GL §5.1',
    wording: 'Eligible activities must directly relate to the project and must include at least one of the following:\nnew research\nproof of concept activities\npre-commercialisation of research outcomes\nindustry-focused education and training activities, such as internships and secondments between industry entities and research organisations\nconferences, workshops, and/or symposia related to the joint research\ninformation sharing and communication initiatives related to the joint research.',
    fields: ['AF-G.2', 'AF-G.9'], items: 'The project\'s activities, mapped to the eligible activity types' },
  { id: 'EL-12.1', family: 'eligible', statement: 'The lead applicant is not {row}', source: 'GL', ref: 'GL §4.3',
    context: 'You are not eligible to apply as lead applicant if you are:',
    wording: 'a research organisation or an entity whose primary purpose is to undertake research',
    fields: ['AF-B.3'], glossary: ['Research organisation'], items: 'Lead\'s principal activity and revenue sources (financial statements, constitution)' },
  { id: 'EL-12.2', family: 'eligible', statement: 'The lead applicant is not {row}', source: 'GL', ref: 'GL §4.3',
    context: 'You are not eligible to apply as lead applicant if you are:',
    wording: 'an entity where the majority of your funding is from government grant programs',
    fields: ['AF-B.3', 'AF-J.6.1'], items: 'Share of the lead\'s funding from government grant programs (financial statements)' },
  { id: 'EL-12.3', family: 'eligible', statement: 'The lead applicant is not {row}', source: 'GL', ref: 'GL §4.3',
    context: 'You are not eligible to apply as lead applicant if you are:',
    wording: 'an entity whose primary purpose is administrative or to provide support services to a CRC-P',
    fields: ['AF-B.3'], items: 'Lead\'s principal activity (constitution, business plan)' },
  { id: 'EL-15.1', family: 'eligible', source: 'AF', ref: 'AF-M.2 (6)',
    wording: 'I confirm that the applicant, project partners and associated activities are in compliance with current Australian Government sanctions.',
    fields: ['AF-M.2'], items: 'Partner countries and activities; sanctions screening' },

  // Rule-checked gates (spec 02 §B.2)
  { id: 'EL-01.1', family: 'rule', source: 'GL', ref: 'GL §4.1', context: 'To be an eligible lead applicant you must:',
    wording: 'have an Australian Business Number (ABN)', fields: ['AF-F.1'], items: 'ABN of every partner (ABN Lookup, ASIC extract)' },
  { id: 'EL-02.1', family: 'rule', source: 'GL', ref: 'GL §4.1', context: 'To be an eligible lead applicant you must:',
    wording: 'be registered for the Goods and Services Tax (GST); and', fields: ['AF-B.2'], items: 'GST registration (ABN Lookup record)' },
  { id: 'EL-03.1', family: 'rule', source: 'GL', ref: 'GL §4.1', context: 'To be an eligible lead applicant you must:',
    wording: 'be a SME at lodgement of application (if you are part of a consolidated group for tax purposes, the consolidated group must have less than 200 employees in total).',
    fields: ['AF-B.1', 'AF-E.1'], glossary: ['Small and medium enterprises (SMEs)', 'Consolidated group'],
    items: 'Headcount; consolidated group membership and group headcount (payroll summary, group structure chart)' },
  { id: 'EL-05.1', family: 'rule', source: 'GL', ref: 'GL §4.1', context: 'A CRC-P application must include amongst its project partners at least:',
    wording: 'a lead applicant which is an Australian industry entity SME', fields: ['AF-B.4', 'AF-F.4a'], items: 'Partner list with ABNs and entity types' },
  { id: 'EL-05.2', family: 'rule', source: 'GL', ref: 'GL §4.1', context: 'A CRC-P application must include amongst its project partners at least:',
    wording: 'a second Australian industry entity of any size; and', fields: ['AF-B.4', 'AF-F.4a'], glossary: ['Australian industry entity'], items: 'Second industry partner: name, ABN, entity type' },
  { id: 'EL-05.3', family: 'rule', source: 'GL', ref: 'GL §4.1', context: 'A CRC-P application must include amongst its project partners at least:',
    wording: 'an Australian research organisation.', fields: ['AF-B.4', 'AF-F.4a'], glossary: ['Research organisation'], items: 'Research partner: name, ABN, organisation type' },
  { id: 'EL-05.4', family: 'rule', source: 'GL', ref: 'GL §4.1',
    wording: 'During the project period the CRC-P must maintain as project partners at least:\ntwo Australian industry entities (one of which is the lead partner); and\none Australian research organisation.',
    fields: ['AF-F.4a'], items: 'Partner commitments for the whole project period' },
  { id: 'EL-05a.1', family: 'rule', source: 'GL', ref: 'GL Glossary',
    wording: 'For the purposes of eligibility in these guidelines, CRCs are not considered research organisations.',
    fields: ['AF-F.4a'], glossary: ['Research organisation', 'Medical Research Institute (MRI)'], items: 'Research partner\'s identity and type (HESA Table A/B provider, corporate Commonwealth entity, state or territory business enterprise, or MRI)' },
  { id: 'EL-06.1', family: 'rule', source: 'GL', ref: 'GL §4.1',
    wording: 'All partners must make cash and/or in-kind contributions to the CRC-P.', fields: ['AF-F.2'], items: 'Cash, cash-staff and in-kind contribution per partner per financial year' },
  { id: 'EL-07.1', family: 'rule', source: 'GL', ref: 'GL §3.1',
    wording: 'The grant amount will be up to 50 per cent of total eligible project expenditure (grant percentage)',
    fields: ['AF-B.5', 'AF-H.2'], items: 'Budget: total eligible project expenditure and grant sought (financial workbook)' },
  { id: 'EL-07.2', family: 'rule', source: 'GL', ref: 'GL §3.1',
    wording: 'The remaining eligible project costs not covered by the grant amount must be covered by you and your partner’s contributions.',
    fields: ['AF-F.2', 'AF-H.1'], items: 'Partner contributions covering the non-grant share (financial workbook)' },
  { id: 'EL-08.1', family: 'rule', source: 'GL', ref: 'GL §3.1',
    wording: 'The minimum grant amount is $100,000.', fields: ['AF-H.2'], items: 'Grant amount sought' },
  { id: 'EL-08.2', family: 'rule', source: 'GL', ref: 'GL §3.1',
    wording: 'The maximum grant amount is $3 million.', fields: ['AF-H.2'], items: 'Grant amount sought' },
  { id: 'EL-09.1', family: 'rule', source: 'GL', ref: 'GL §5.1', context: 'To be eligible your project must:',
    wording: 'have at least $200,000 in total eligible project value', fields: ['AF-B.6', 'AF-H.1'], items: 'Total eligible project value (financial workbook)' },
  { id: 'EL-10.1', family: 'rule', source: 'GL', ref: 'GL §3.2',
    wording: 'The maximum project period is 3 years.', fields: ['AF-G.8'], items: 'Project start and end dates' },
  ...[
    ['EL-12.4', 'an individual'],
    ['EL-12.5', 'a sole trader'],
    ['EL-12.6', 'a partnership'],
    ['EL-12.7', 'an unincorporated association'],
    ['EL-12.8', 'a trust (however, an incorporated trustee may apply on behalf of a trust)'],
    ['EL-12.9', 'a Commonwealth, state, territory or local government body (including government business enterprises)'],
    ['EL-12.10', 'a non-corporate Commonwealth entity; or'],
    ['EL-12.11', 'any other organisation not included in section 4.1.'],
  ].map(([id, wording]) => ({
    id, family: 'rule', source: 'GL', ref: 'GL §4.3',
    context: 'You are not eligible to apply as lead applicant if you are:',
    wording, fields: ['AF-B.3'], items: 'Lead\'s legal entity type (ASIC extract, constitution, trust deed)',
  })),
  { id: 'EL-13.1', family: 'rule', source: 'GL', ref: 'GL §4.3',
    context: 'You are not eligible to apply if you are an organisation, or you have a project partner which is:',
    wording: 'included on the National Redress Scheme’s website on the list of ‘Institutions that have not joined or signified their intent to join the Scheme’',
    fields: ['AF-M.2'], items: 'Names of every partner, checked against the Redress Scheme list' },
  { id: 'EL-14.1', family: 'rule', source: 'GL', ref: 'GL §4.3',
    context: 'You are not eligible to apply if you are an organisation, or you have a project partner which is:',
    wording: 'an employer of 100 or more employees that has not complied with the Workplace Gender Equality Act (2012).',
    fields: ['AF-M.2'], items: 'Headcount of each partner; WGEA compliance for any with 100 or more employees' },
  { id: 'EL-17.1', family: 'rule', source: 'GL', ref: 'GL §4.2', context: 'We can only accept applications:',
    wording: 'where you provide the signed trust deed of the lead applicant (if applying on behalf of a trust).',
    fields: ['AF-L.2'], items: 'Signed trust deed (if the lead applies as trustee)' },

  // Declarations and confirmations: never scored or inferred (spec 02 §B.3)
  { id: 'EL-16.1', family: 'confirm', source: 'AF', ref: 'AF-M.2 (2)',
    wording: 'I declare that the proposed project outlined in this application and any associated expenditure has been endorsed by the applicant’s board/ management committee or person with authority to commit the applicant to this project.',
    fields: ['AF-M.2'], items: 'Board or management committee minute endorsing the project and expenditure (kept on file)' },
  ...[
    ['EL-18.1', 'The partner has been made aware of its obligations under the CRC Projects Grant Opportunity Guidelines.'],
    ['EL-18.2', 'Subject to this application being successful, the partner will support and actively participate in the proposed project by entering into a partner agreement.'],
    ['EL-18.3', 'Subject to this application being successful, the partner will contribute the staff, funds and other resources indicated in the application and the partner has obtained, or will obtain, the necessary authorisations to do so.'],
    ['EL-18.4', 'The partner is aware of the eligible expenditure guidance outlined in the CRC Projects Grant Opportunity Guidelines, especially in relation to expenditure associated with clinical trials.'],
  ].map(([id, wording]) => ({
    id, family: 'confirm', source: 'AF', ref: 'AF-F.4e', context: 'In regards to this project partner:',
    wording, fields: ['AF-F.4e'], items: 'Sign-off from each partner\'s authorised representative (email or letter kept on file)',
  })),
  { id: 'DD-01.1', family: 'confirm', source: 'GL', ref: 'GL §13.7',
    wording: 'You must disclose whether any of your board members, management or persons of authority have been subject to any pecuniary penalty, whether civil, criminal or administrative, imposed by a Commonwealth, state, or territory court or a Commonwealth, state, or territory entity.',
    fields: ['AF-G.11.1', 'AF-G.11.2'], items: 'Any pecuniary penalties on board members, management or persons of authority, with details' },
  { id: 'DD-02.1', family: 'confirm', source: 'AF', ref: 'AF-G.12a',
    wording: 'Does your project receive any funding or non-financial support from a foreign source?',
    fields: ['AF-G.12a.1', 'AF-G.12a.2'], items: 'Foreign funding or non-financial support to the project, with details' },
  { id: 'DD-03.1', family: 'confirm', source: 'AF', ref: 'AF-G.12b',
    wording: 'Do any entities or key personnel involved with the project receive financial support or benefits from a foreign source?',
    fields: ['AF-G.12b.1', 'AF-G.12b.2'], items: 'Foreign financial support or benefits to partners or key personnel, with details' },
  { id: 'DD-04.1', family: 'confirm', source: 'AF', ref: 'AF-G.12c',
    wording: 'Do any entities or key personnel involved with the project have any current or former association with a foreign talent program?',
    fields: ['AF-G.12c.1', 'AF-G.12c.2'], items: 'Current or former foreign talent program associations, with details' },
  { id: 'DD-05.1', family: 'confirm', source: 'AF', ref: 'AF-G.12d',
    wording: 'Do any entities or key personnel involved with the project have any ties to a foreign government, military or state-owned enterprise?',
    fields: ['AF-G.12d.1', 'AF-G.12d.2'], items: 'Ties to a foreign government, military or state-owned enterprise, with details' },
  { id: 'DD-06.1', family: 'confirm', source: 'AF', ref: 'AF-G.13',
    wording: 'Do you have a plan to manage any potential security risks associated with the project and your organisation more broadly?',
    fields: ['AF-G.13'], items: 'Whether a security plan exists (cyber, data handling, national security)' },
  { id: 'DD-07.1', family: 'confirm', source: 'GL', ref: 'GL §13.2',
    wording: 'As part of your application, we will ask you to declare any perceived or existing conflicts of interests or confirm that, to the best of your knowledge, there is no conflict of interest.',
    fields: ['AF-L.1.1', 'AF-L.1.2', 'AF-L.1.3'], items: 'Perceived or existing conflicts of interest and how they are managed' },
  { id: 'DD-08.1', family: 'confirm', source: 'AF', ref: 'AF-J.6',
    wording: 'Have any of the project partners received any Commonwealth, state and/or territory government assistance during the past five years that has assisted in the development of this project?',
    fields: ['AF-J.6.1', 'AF-J.6.2', 'AF-J.6.3'], items: 'Government assistance in the past five years: agency, program, dates, amount, what it was used for and results' },

  // Government priorities the J fields are drafted against (not scored)
  { id: 'PR-01.1', family: 'priority', source: 'GL', ref: 'GL §4.2',
    wording: 'Meritorious applications submitted by eligible Aboriginal and Torres Strait Islander organisations will be prioritised when recommending applications for funding.',
    fields: ['AF-J.4'], items: 'Indigenous Corporation Number (ICN) or Supply Nation registration' },
  { id: 'PR-02.1', family: 'priority', source: 'GL', ref: 'GL App A.1',
    wording: 'The Government is seeking applications that develop or enhance AI systems and technologies, to help accelerate the development and commercialisation of AI by businesses and researchers across Australia.',
    fields: ['AF-J.1.1', 'AF-J.1.2'], glossary: ['AI system'], items: 'Description of the project\'s AI component and its sector' },
  { id: 'PR-03.1', family: 'priority', source: 'GL', ref: 'GL App A.2',
    wording: 'The Australian Government’s National Reconstruction Fund provides finance to diversify and transform Australia’s industry and economy through targeted investment in the following priority areas:\nvalue-add in resources\nvalue-add in agriculture, forestry and fisheries\ntransport\nmedical science\nrenewables and low emission technologies\ndefence capability\nenabling capabilities.',
    fields: ['AF-J.2'], items: 'Primary and secondary NRF priority area, with rationale' },
  { id: 'PR-04.1', family: 'priority', source: 'GL', ref: 'GL App A.3',
    wording: 'The Australian Government’s National Science and Research Priorities guide Australian science and research efforts and help the Australian Government align investments in the science, research, technology, innovation and commercialisation system.',
    fields: ['AF-J.3'], items: 'Primary and secondary Science and Research Priority, with rationale' },
  { id: 'PR-05.1', family: 'priority', source: 'GL', ref: 'GL Glossary',
    wording: 'AI systems and technologies, the National AI Plan, the National Reconstruction Fund priority areas, the National Science and Research Priorities or any other science, research, industry and innovation priorities identified by the Australian Government from time to time.',
    fields: ['AF-J.5'], glossary: ['Government priorities'], items: 'Up to three other government priorities, each with its basis (report or statement)' },

  // The form's own prompts, so drafted fields that no guideline row covers still get passages
  { id: 'FQ-G.1a.1', family: 'form', source: 'AF', ref: 'AF-G.1',
    wording: 'Provide a project title.', fields: ['AF-G.1a'], items: 'Working title of the project' },
  { id: 'FQ-G.1b.1', family: 'form', source: 'AF', ref: 'AF-G.1',
    wording: 'Ensure your project description focuses on your project’s key activities and outcomes. Outline what it is you are going to do and how these activities will benefit your organisation.',
    fields: ['AF-G.1b'], items: 'Plain summary of the key activities and outcomes, suitable for publication' },
  { id: 'FQ-F.4c.1', family: 'form', source: 'AF', ref: 'AF-F.4',
    wording: 'describe the project partner’s company structure and relationships with the other project partners (This may include related entities, entities with the same ultimate holding company, entities with common directorship, entities with common major shareholders.).',
    fields: ['AF-F.4c'], items: 'Each partner\'s company structure, related entities, common directors or major shareholders with other partners (ASIC extracts, group structure chart)' },
  { id: 'FQ-G.7.1', family: 'form', source: 'AF', ref: 'AF-G.7',
    wording: 'If yes describe how this will be carried out (for example, research, consultation, use of Traditional and Cultural Knowledge)',
    fields: ['AF-G.7.2'], items: 'How the project works with Indigenous communities: research, consultation, use of Traditional and Cultural Knowledge' },
].map((r) => ({ deliverable: AF, ...r }));
