// Decision-model questions for CRC-P Round 19 (spec 02 §A, §B.1, §D, §E, §G) and the
// state recipe for each. build.mjs expands the per-row questions from requirements.mjs.
//
// A state recipe is an ordered list of parts. The engine assembles them in order and,
// when the state is over the decider role's limit, drops parts by `trim` (1 first,
// then 2; parts without `trim` are never dropped), per spec 05 §7.5.
//
// Part types:
//   criterion      criterion heading and points (verbatim)
//   subcriterion   the full sub-criterion wording and points (verbatim)
//   row            the requirement row's verbatim wording (and its context sentence)
//   text           a verbatim text from `texts` below, by key
//   glossary       a verbatim Glossary definition from `glossary` below, by term
//   draft          the current draft of the given fields (the field being assessed)
//   fields         other form fields, as drafted or filled
//   passages       digest passages for the row: "cited" (cited by the draft) or "linked"
//                  (all confirmed passages for the row)
//   reference      the matching answer from the reference application, if one was picked
//   project_scale  grant amount requested and project duration
//   rule_results   results of the code-checked rules (rules.json)
//   gap_context    decision scores, the weak/fix explanation and whether re-search found
//                  anything new (gap type only)
//   document       the document's text (first ~28K tokens)
//   passage        one passage's exact text

// Verbatim texts put into state, checked against the guidelines by check.mjs.
export const texts = {
  'general-guidance': {
    source: 'GL', ref: 'GL §6',
    text: 'The amount of detail and supporting evidence you provide in your application should be relative to the project size, complexity and grant amount requested. You should provide evidence to support your answers.',
  },
  'competitive-each-criterion': {
    source: 'GL', ref: 'GL §6',
    text: 'We will only consider funding applications that are competitive against each assessment criterion.',
  },
  'priorities-scoring': {
    source: 'GL', ref: 'GL App A',
    text: 'An application which strongly aligns with Government priorities will score higher in this part of the assessment criteria than an application which does not.',
  },
  'program-delegate-eligibility': {
    source: 'GL', ref: 'GL §4',
    text: 'The Program Delegate (who is a General Manager within the department with responsibility for administering the program) makes the final decision about whether an application meets the eligibility criteria and decisions will not be reviewed.',
  },
};

// Glossary definitions used in state (GL §14), copied verbatim.
export const glossary = {
  'AI system': 'A machine-based system that, for explicit or implicit objectives, infers, from the input it receives, how to generate outputs such as predictions, content, recommendations, or decisions that can influence physical or virtual environments. Different AI systems vary in their levels of autonomy and adaptiveness after deployment.',
  'Australian industry entity': 'An Australian business with an Australian Business Number whose trading activities are a substantial and not merely peripheral activity of the business and is not:\na research organisation or an entity whose primary purpose is to undertake research\nan entity whose primary function is administrative or to provide support services to a CRC-P\na Commonwealth, state, territory or local government body (including government business enterprises).\nAustralian industry entities include, but are not limited to:\nsole traders\npartnerships\ncooperatives\ncompanies.',
  'Consolidated group': 'Has the same meaning as in section 703-5 of the Income Tax Assessment Act 1997 (Cth).',
  'Government priorities': 'AI systems and technologies, the National AI Plan, the National Reconstruction Fund priority areas, the National Science and Research Priorities or any other science, research, industry and innovation priorities identified by the Australian Government from time to time. See Appendix A.',
  'Incorporated Trustee': 'An entity, acting in its capacity as trustee of a trust, which is itself a corporation or other entity incorporated in Australia.',
  'Medical Research Institute (MRI)': 'An institute that has the primary purpose of conducting medical research and is a currently registered charity with the Australian Charities and Not-for-Profits Commission.',
  'Regional and remote Australia': 'Regional and remote Australia refers to areas that fall outside of Major Cities of Australia under the Australian Statistical Geography Standard (includes Inner Regional Australia, Outer Regional Australia, Remote Australia, Very Remote Australia).',
  'Research organisation': 'All higher education providers listed at Table A and Table B of the Higher Education Support Act 2003 (Cth) and corporate Commonwealth entities, and state and territory business enterprises which undertake publicly funded research and Medical Research Institutes. For the purposes of eligibility in these guidelines, CRCs are not considered research organisations.',
  'Security': 'Measures taken to protect something, including governance, physical, information and personnel arrangements (e.g. vetting, access and planning). These may sometimes extend to protecting something of national security interest, such as advanced or dual-use technologies (where national security issues are identified they should be reported to the department as soon as possible).',
  'Small and medium enterprises (SMEs)': 'Businesses with less than 200 employees by headcount. If you are part of a consolidated group for tax purposes, the consolidated group must have less than 200 employees in total.',
  'Trading activity': 'The activity of providing or intending to provide goods or services for payment.',
};

// Extra state per row beyond the family recipe (spec 02 §A.3 notes).
export const rowExtras = {
  'MC-1a.3': [{ type: 'text', key: 'priorities-scoring' }],
  'MC-3a.2': [{ type: 'glossary', term: 'Security' }],
  'MC-3b.2': [{ type: 'glossary', term: 'Security' }],
  'MC-3c.3': [{ type: 'glossary', term: 'Security' }],
  'MC-4c.1': [{ type: 'glossary', term: 'Regional and remote Australia' }],
};

export const templates = {
  compelling: 'An expert on the Cooperative Research Centres Advisory Committee, assessing this application against other applications, would find the draft\'s response to the requirement \'{row}\' compelling: specific, supported by evidence, quantified where possible, and competitive for the points available.',
  // {statement} is the row's statement with its quoted wording, e.g. "The lead applicant is not 'an individual'".
  eligible: 'Based on the evidence provided, the application meets this eligibility requirement as the Program Delegate would read it: {statement}',
};

// State recipes per family (spec 02 §A.1, §B.1).
export const recipes = {
  compelling: (row) => [
    { type: 'criterion', id: row.criterion },
    { type: 'subcriterion', id: row.subcriterion },
    { type: 'row', id: row.id },
    { type: 'text', key: 'general-guidance' },
    { type: 'text', key: 'competitive-each-criterion' },
    ...(rowExtras[row.id] ?? []),
    { type: 'draft', fields: row.fields },
    { type: 'fields', fields: row.stateFields, trim: 1 },
    { type: 'passages', scope: 'cited' },
    { type: 'passages', scope: 'linked', trim: 2 },
    { type: 'reference', trim: 1 },
    { type: 'project_scale' },
  ],
  eligible: (row) => [
    { type: 'row', id: row.id },
    { type: 'text', key: 'program-delegate-eligibility' },
    ...(row.glossary ?? []).map((term) => ({ type: 'glossary', term })),
    { type: 'draft', fields: row.fields },
    { type: 'passages', scope: 'cited' },
    { type: 'passages', scope: 'linked', trim: 2 },
  ],
};

// Questions that are not per row.
export const otherQuestions = [
  {
    id: 'GAP', family: 'gap', kind: 'choice', askedWhen: 'decide: each row below threshold',
    prompt: 'What is the main reason this draft falls short of the requirement?',
    options: [
      { value: 'drafting', meaning: 'The evidence is in the digest table but unused or weakly phrased', next: 'redraft' },
      { value: 'evidence', meaning: 'A claim is made but no passage supports it', next: 'research-then-redraft-or-information-needed' },
      { value: 'information', meaning: 'No passage covers the requirement', next: 'information-needed' },
      { value: 'conflict', meaning: 'Documents or fields disagree', next: 'advisor-decision' },
      { value: 'eligibility', meaning: 'A gate fails, and drafting can\'t fix it', next: 'blocker' },
      { value: 'strategic', meaning: 'A framing choice only the advisor or client can make', next: 'advisor-decision' },
      { value: 'space', meaning: 'The row can\'t improve without taking characters from another row in the same box', next: 'out-of-space' },
    ],
    state: [
      { type: 'row' },
      { type: 'draft' },
      { type: 'gap_context' },
      { type: 'passages', scope: 'linked', trim: 2 },
    ],
  },
  {
    id: 'DG-1', family: 'digest', kind: 'choice', askedWhen: 'digest: each document',
    prompt: 'Which type of document is this?',
    options: ['annual report', 'financial statements', 'BAS or tax record', 'company or ASIC extract', 'trust deed', 'business plan', 'project plan', 'technical report', 'CV or bio', 'letter of support or commitment', 'partner agreement or MOU', 'IP record (patent, licence)', 'market or industry report', 'email or meeting notes', 'other'].map((value) => ({ value })),
    state: [{ type: 'document' }],
  },
  {
    id: 'DG-2', family: 'digest', kind: 'probability', askedWhen: 'digest: each document',
    prompt: 'This file is a bundle of several separate documents.',
    state: [{ type: 'document' }],
  },
  {
    id: 'DG-3', family: 'digest', kind: 'choice', askedWhen: 'digest: each document',
    prompt: 'Which party does this document describe?',
    options: [{ value: 'lead applicant' }, { value: 'industry partner', perPartner: true }, { value: 'research organisation', perPartner: true }, { value: 'multiple' }, { value: 'none' }],
    state: [{ type: 'document' }],
  },
  {
    id: 'DG-4', family: 'digest', kind: 'probability', askedWhen: 'digest: each candidate passage-to-row link',
    prompt: 'This passage provides evidence for the requirement \'{row}\'.',
    suggestFloor: 0.5,
    state: [{ type: 'row' }, { type: 'passage' }],
  },
  {
    id: 'OV-C', family: 'overall', kind: 'probability', askedWhen: 'after each assessment pass, once all fields are final',
    prompt: 'An expert on the CRC Advisory Committee, comparing this application with others in the round, would find it compelling overall.',
    state: [
      { type: 'criterion', id: 'MC-1' }, { type: 'criterion', id: 'MC-2' },
      { type: 'criterion', id: 'MC-3' }, { type: 'criterion', id: 'MC-4' },
      ...['MC-1a', 'MC-1b', 'MC-1c', 'MC-2a', 'MC-2b', 'MC-2c', 'MC-3a', 'MC-3b', 'MC-3c', 'MC-4a', 'MC-4b', 'MC-4c', 'MC-4d'].map((id) => ({ type: 'subcriterion', id })),
      { type: 'draft', fields: ['AF-I.1', 'AF-I.2', 'AF-I.3', 'AF-I.4'] },
    ],
  },
  {
    id: 'OV-E', family: 'overall', kind: 'probability', askedWhen: 'after each assessment pass, once all fields are final',
    prompt: 'This application meets every CRC-P eligibility requirement.',
    state: [
      { type: 'rows', family: 'eligible' },
      { type: 'rows', family: 'rule' },
      { type: 'rule_results' },
      { type: 'fields', fields: 'eligible-rows' },
    ],
  },
];
