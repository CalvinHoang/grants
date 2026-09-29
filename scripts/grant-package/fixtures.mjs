// Synthetic facts for exercising rules.json. Invented values, no client data (spec 05 §11).
// 51 824 753 556 is the ATO's published example ABN.

export const validFacts = {
  sme_answer: 'Yes',
  gst_answer: 'Yes',
  headcount: 42,
  financials: { turnover: 5200000, export_revenue: 0, rd_expenditure: 310000, taxable_income: 180000, headcount: 42, contractors: 3 },
  partners: [
    { abn: '51 824 753 556', name: 'Lead SME Pty Ltd', type: 'SME' },
    { abn: '51824753556', name: 'Second Industry Pty Ltd', type: 'Large industry' },
    { abn: '51 824 753 556', name: 'Example University', type: 'Research organisation' },
  ],
  lead_entity_type: 'company',
  lead_is_trustee: false,
  attachments: [],
  start_date: '2026-10-01',
  end_date: '2029-09-30',
  duration_months: 36,
  milestones: [
    { start: '2026-10-01', end: '2027-06-30' },
    { start: '2027-07-01', end: '2028-06-30' },
    { start: '2028-07-01', end: '2029-09-30' },
  ],
  sites: [{ percent: 70 }, { percent: 30 }],
  personnel: [{}, {}, {}],
  trl_start: 3,
  trl_target: 6,
  other_priorities: [{}],
  grant: 1000000,
  total_eligible_expenditure: 2400000,
  contributions: [{ cash: 100000, staff: 200000, in_kind: 0 }, { cash: 0, staff: 0, in_kind: 50000 }, { cash: 0, staff: 150000, in_kind: 0 }],
  audit_cost: 20000,
  overseas_cost: 0,
  travel_cost: 30000,
};

const with_ = (patch) => ({ ...validFacts, ...patch });

// One failing case per rule where the failure is worth pinning down.
export const failingFacts = {
  'EL-01': with_({ partners: [{ ...validFacts.partners[0], abn: '51 824 753 557' }, ...validFacts.partners.slice(1)] }),
  'FR-F.1': with_({ partners: [...validFacts.partners.slice(0, 2), { ...validFacts.partners[2], abn: '12 345 678 901' }] }),
  'EL-03': with_({ group_headcount: 240 }),
  'EL-05': with_({ partners: validFacts.partners.map((p) => (p.type === 'Research organisation' ? { ...p, type: 'Other' } : p)) }),
  'EL-10': with_({ end_date: '2029-10-31', duration_months: 37 }),
  'EL-12': with_({ lead_entity_type: 'partnership' }),
  'EL-14': with_({ headcount: 120 }),
  'EL-17': with_({ lead_is_trustee: true, attachments: [{ kind: 'other' }] }),
  'FR-E.1': with_({ financials: { ...validFacts.financials, turnover: 5200000.5 } }),
  'FR-G.6': with_({ trl_target: 10 }),
  'FR-G.9': with_({ milestones: validFacts.milestones.slice(0, 2) }),
  'FR-G.10': with_({ sites: [{ percent: 70 }, { percent: 20 }] }),
  'EL-07': with_({ grant: 1300000 }),
  'EL-08': with_({ grant: 90000 }),
};
