// Code-checked rules for CRC-P Round 19 (spec 02 §B.2), as data. The engine evaluates
// `check` with the expression language in tools/grant-package/rules-lang.mjs (grammar
// in rules.json → `language`). Facts name where each value comes from.
//
// onFail:    blocker (eligibility fails) · advisor (flag for the advisor to decide) ·
//            form (the form would be rejected by the portal)
// onMissing: what happens when a fact the check needs is not available yet:
//            information-needed (Information needed flag) · skip (not evaluated)
// inScope:   false for rules that need data v1 doesn't produce (budget is out of scope,
//            spec 05 §1.2). They stay here so the package is complete; the engine reports
//            them as "not checked". Rows no code can check (check: null) go to rules.json
//            `notChecked` with the reason.
// Ids: EL- eligibility gate · FR- form rule (the portal's own validation) · BR- budget rule.

export const facts = {
  sme_answer:           { from: 'field', field: 'AF-B.1', type: 'yes-no' },
  gst_answer:           { from: 'field', field: 'AF-B.2', type: 'yes-no' },
  headcount:            { from: 'field', field: 'AF-E.1', part: 'Number of employees including working proprietors and salaried directors (headcount)', type: 'integer' },
  group_headcount:      { from: 'digest', type: 'integer', note: 'Headcount of the consolidated group for tax purposes, if the lead is in one (extracted from the client documents)' },
  financials:           { from: 'field', field: 'AF-E.1', type: 'object', note: 'All AF-E.1 values; the form requires whole numbers' },
  partners:             { from: 'field', field: 'AF-F.4a', repeat: true, type: 'list',
                          item: { abn: { field: 'AF-F.1', part: 'ABN', type: 'string' }, name: { part: 'Organisation name', type: 'string' }, type: { part: 'Partner type (large industry, SME, research organisation or other)', type: 'enum', values: ['Large industry', 'SME', 'Research organisation', 'Other'] } },
                          note: 'The first partner is the lead applicant' },
  lead_entity_type:     { from: 'digest', type: 'enum', values: ['company', 'incorporated trustee', 'individual', 'sole trader', 'partnership', 'unincorporated association', 'trust', 'government body', 'non-corporate Commonwealth entity', 'other'], note: 'From the company or ASIC extract, constitution or trust deed' },
  lead_is_trustee:      { from: 'digest', type: 'boolean', note: 'The lead applies as an incorporated trustee on behalf of a trust' },
  attachments:          { from: 'field', field: 'AF-L.2', type: 'list', item: { kind: { type: 'enum', values: ['trust deed', 'ICN or Supply Nation evidence', 'other'] } } },
  start_date:           { from: 'field', field: 'AF-G.8', part: 'Estimated project start date', type: 'date' },
  end_date:             { from: 'field', field: 'AF-G.8', part: 'Estimated project end date', type: 'date' },
  duration_months:      { from: 'field', field: 'AF-G.8', part: 'Estimated project duration (in months)', type: 'integer' },
  milestones:           { from: 'field', field: 'AF-G.9', repeat: true, type: 'list', item: { start: { part: 'Estimated start date', type: 'date' }, end: { part: 'Estimated end date', type: 'date' } } },
  sites:                { from: 'field', field: 'AF-G.10', repeat: true, type: 'list', item: { percent: { part: 'Estimated percentage of project value expected to be undertaken at site', type: 'number' } } },
  personnel:            { from: 'field', field: 'AF-G.4', repeat: true, type: 'list' },
  trl_start:            { from: 'field', field: 'AF-G.6.1', type: 'integer' },
  trl_target:           { from: 'field', field: 'AF-G.6.2', type: 'integer' },
  other_priorities:     { from: 'field', field: 'AF-J.5', repeat: true, type: 'list' },
  grant:                { from: 'budget', field: 'AF-H.2', type: 'number' },
  total_eligible_expenditure: { from: 'budget', field: 'AF-H.1', type: 'number', note: 'Eligible expenditure plus allowable in-kind contributions (GL §3.1)' },
  contributions:        { from: 'budget', field: 'AF-F.2', repeat: true, type: 'list', item: { cash: { type: 'number' }, staff: { type: 'number' }, in_kind: { type: 'number' } } },
  audit_cost:           { from: 'budget', field: 'AF-H.1', type: 'number' },
  overseas_cost:        { from: 'budget', field: 'AF-H.1', type: 'number' },
  travel_cost:          { from: 'budget', field: 'AF-H.1', type: 'number' },
};

export const rules = [
  // Eligibility (spec 02 §B.2)
  { id: 'EL-01', rows: ['EL-01.1'], fields: ['AF-F.1'], onFail: 'blocker', onMissing: 'information-needed',
    check: 'count(partners) >= 1 and abn_valid(partners[0].abn)',
    note: 'The lead applicant\'s ABN (the first partner). Checksum only: ABN Lookup is not called, because the app makes outbound calls only to model providers, jev and Microsoft Graph.' },
  { id: 'EL-02', rows: ['EL-02.1'], fields: ['AF-B.2'], onFail: 'blocker', onMissing: 'skip',
    check: 'gst_answer == \'Yes\'', note: 'Checked once the advisor has answered AF-B.2.' },
  { id: 'EL-03', rows: ['EL-03.1'], fields: ['AF-B.1', 'AF-E.1'], onFail: 'blocker', onMissing: 'information-needed',
    check: 'headcount < 200 and (not is_set(group_headcount) or group_headcount < 200)' },
  { id: 'EL-05', rows: ['EL-05.1', 'EL-05.2', 'EL-05.3', 'EL-05.4'], fields: ['AF-B.4', 'AF-F.4a'], onFail: 'blocker', onMissing: 'information-needed',
    check: 'count(partners) >= 3 and partners[0].type == \'SME\' and count(partners, type == \'SME\' or type == \'Large industry\') >= 2 and count(partners, type == \'Research organisation\') >= 1',
    note: 'Checked on the partners listed at application. EL-05.4 (keeping them for the whole project) is a post-award obligation.' },
  { id: 'EL-05a', rows: ['EL-05a.1'], fields: ['AF-F.4a'], onFail: 'blocker', onMissing: 'skip', inScope: false,
    check: null, note: 'Needs the HESA Table A/B provider list and the ACNC-registered MRI list, which this package does not ship. EL-05 checks the partner type the advisor recorded.' },
  { id: 'EL-06', rows: ['EL-06.1'], fields: ['AF-F.2'], onFail: 'blocker', onMissing: 'skip', inScope: false,
    check: 'all(contributions, cash + staff + in_kind > 0)', note: 'Budget is out of scope in v1.' },
  { id: 'EL-07', rows: ['EL-07.1', 'EL-07.2'], fields: ['AF-B.5', 'AF-H.2'], onFail: 'blocker', onMissing: 'skip', inScope: false,
    check: 'grant <= 0.5 * total_eligible_expenditure', note: 'Budget is out of scope in v1.' },
  { id: 'EL-08', rows: ['EL-08.1', 'EL-08.2'], fields: ['AF-H.2'], onFail: 'blocker', onMissing: 'skip', inScope: false,
    check: 'grant >= 100000 and grant <= 3000000', note: 'Budget is out of scope in v1.' },
  { id: 'EL-09', rows: ['EL-09.1'], fields: ['AF-B.6', 'AF-H.1'], onFail: 'blocker', onMissing: 'skip', inScope: false,
    check: 'total_eligible_expenditure >= 200000', note: 'Budget is out of scope in v1.' },
  { id: 'EL-10', rows: ['EL-10.1'], fields: ['AF-G.8'], onFail: 'blocker', onMissing: 'information-needed',
    check: 'end_date > start_date and duration_months <= 36 and months_between(start_date, end_date) <= 36' },
  { id: 'EL-12', rows: ['EL-12.4', 'EL-12.5', 'EL-12.6', 'EL-12.7', 'EL-12.8', 'EL-12.9', 'EL-12.10', 'EL-12.11'], fields: ['AF-B.3'], onFail: 'blocker', onMissing: 'information-needed',
    check: 'lead_entity_type in [\'company\', \'incorporated trustee\']' },
  { id: 'EL-13', rows: ['EL-13.1'], fields: ['AF-M.2'], onFail: 'blocker', onMissing: 'skip', inScope: false,
    check: null, note: 'Needs the National Redress Scheme list of non-participating institutions, which this package does not ship. The advisor confirms it in the AF-M.2 declaration.' },
  { id: 'EL-14', rows: ['EL-14.1'], fields: ['AF-M.2'], onFail: 'advisor', onMissing: 'skip',
    check: 'headcount < 100', note: 'An applicant with 100 or more employees must be WGEA compliant: flag for the advisor to confirm. Partners\' headcounts are not on the form.' },
  { id: 'EL-17', rows: ['EL-17.1'], fields: ['AF-L.2'], onFail: 'blocker', onMissing: 'skip',
    check: 'not lead_is_trustee or any(attachments, kind == \'trust deed\')' },

  // Form rules: the portal rejects the page otherwise
  { id: 'FR-F.1', rows: [], fields: ['AF-F.1'], onFail: 'advisor', onMissing: 'skip',
    check: 'all(partners, abn_valid(abn))', source: 'AF: "If a project partner other than the lead applicant is Australian, but does not have an ABN, contact us."' },
  { id: 'FR-E.1', rows: [], fields: ['AF-E.1'], onFail: 'form', onMissing: 'skip',
    check: 'all_values(financials, is_integer(value))', source: 'AF: "All values must be whole numbers."' },
  { id: 'FR-G.4', rows: [], fields: ['AF-G.4'], onFail: 'form', onMissing: 'skip',
    check: 'count(personnel) <= 3', source: 'AF: "Provide details of up to 3 key personnel"' },
  { id: 'FR-G.6', rows: [], fields: ['AF-G.6.1', 'AF-G.6.2'], onFail: 'form', onMissing: 'information-needed',
    check: 'is_integer(trl_start) and is_integer(trl_target) and trl_start >= 1 and trl_start <= 9 and trl_target >= 1 and trl_target <= 9', source: 'AF: "There are nine TRL levels ranging from TRL 1 to TRL 9."' },
  { id: 'FR-G.6b', rows: [], fields: ['AF-G.6.1', 'AF-G.6.2'], onFail: 'advisor', onMissing: 'skip',
    check: 'trl_target >= trl_start', source: 'Inferred: the form allows equal levels; a target below the start is flagged, not rejected.' },
  { id: 'FR-G.8', rows: [], fields: ['AF-G.8'], onFail: 'advisor', onMissing: 'skip',
    check: 'abs(duration_months - months_between(start_date, end_date)) <= 1', source: 'Inferred: the stated duration should match the dates.' },
  { id: 'FR-G.9', rows: [], fields: ['AF-G.9'], onFail: 'form', onMissing: 'information-needed',
    check: 'count(milestones) >= 3 and count(milestones) <= 10 and all(milestones, start >= start_date and end <= end_date and end >= start)',
    source: 'AF: "You must add between 3 and 10 milestones." and "The milestone start and end dates must be within the project start and end dates."' },
  { id: 'FR-G.10', rows: [], fields: ['AF-G.10'], onFail: 'advisor', onMissing: 'information-needed',
    check: 'count(sites) >= 1 and abs(sum(sites, percent) - 100) < 0.01', source: 'Inferred: site percentages of project value should total 100.' },
  { id: 'FR-J.5', rows: [], fields: ['AF-J.5'], onFail: 'form', onMissing: 'skip',
    check: 'count(other_priorities) <= 3', source: 'AF: "List up to three of these below."' },

  // Budget caps (App C; out of scope in v1)
  { id: 'BR-H.1a', rows: [], fields: ['AF-H.1'], onFail: 'form', onMissing: 'skip', inScope: false,
    check: 'audit_cost <= 0.01 * total_eligible_expenditure', source: 'AF: "Audit costs (up to 1 per cent of eligible project expenditure)"' },
  { id: 'BR-H.1b', rows: [], fields: ['AF-H.1'], onFail: 'form', onMissing: 'skip', inScope: false,
    check: 'overseas_cost <= 0.1 * total_eligible_expenditure', source: 'AF: "Overseas (up to 10 per cent of eligible project expenditure)"' },
  { id: 'BR-H.1c', rows: [], fields: ['AF-H.1'], onFail: 'form', onMissing: 'skip', inScope: false,
    check: 'travel_cost <= 0.1 * total_eligible_expenditure', source: 'AF: "Travel (up to 10 per cent of eligible project expenditure)"' },
].map((r) => ({ inScope: true, ...r }));
