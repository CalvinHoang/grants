// Layout fixture: the synthetic client "Harbour Robotics" (§11) as the mockup shows it, so the
// shell can be exercised and screenshotted before storage (WP-4) and ingestion (WP-5) exist.
// Loaded only when the app starts with GW_FIXTURE=harbour. All names are fictional.
import { DRAFT_VIEW, type ApplicationListItem, type ApplicationView } from "./workspace";

export const FIXTURE_APPLICATIONS: ApplicationListItem[] = [
  { id: "harbour", clientName: "Harbour Robotics", grant: "CRC-P" },
  { id: "coastal", clientName: "Coastal Aquaculture", grant: "CRC-P" },
  { id: "meridian", clientName: "Meridian Health AI", grant: "CRC-P" },
];

export const HARBOUR_FIXTURE: ApplicationView = {
  id: "harbour",
  clientName: "Harbour Robotics",
  grant: "CRC-P",
  grantRound: "CRC-P Round 19",
  grantDocs: [
    { id: "g-guidelines", name: "Guidelines", tag: "PDF" },
    { id: "g-form", name: "Application form", tag: "PDF" },
    { id: "g-agreement", name: "Sample grant agreement", tag: "PDF" },
    { id: "g-partners", name: "Partners agreement template", tag: "DOCX" },
    { id: "g-workbook", name: "Financial workbook", tag: "XLSX" },
    { id: "g-faq", name: "Program FAQ", tag: "PDF" },
  ],
  workflow: [
    { id: "requirements", name: "Requirements table", tag: "45 rows" },
    { id: "digest", name: "Digest table", tag: "128" },
  ],
  deliverables: [{ id: DRAFT_VIEW, name: "R&D application", tag: "3 flags" }],
  rfis: ["RFI · Lead applicant · 27 Sep 2026"],
  sharepoint: {
    path: "Harbour Robotics / CRC-P",
    items: [
      { id: "D001", name: "Board minutes Aug 2026", tag: "DOCX" },
      { id: "D002", name: "Project plan v3", tag: "PDF" },
      { id: "D003", name: "Financials FY26", tag: "XLSX" },
      { id: "D004", name: "Partner letter, Portside Marine", tag: "PDF" },
      { id: "D005", name: "ASIC company extract", tag: "PDF" },
    ],
  },
  local: {
    path: "Grant Workbench / Harbour Robotics",
    items: [
      { id: "D006", name: "Market sizing notes", tag: "DOCX" },
      { id: "D007", name: "Supplier quote, sonar", tag: "PDF" },
    ],
  },
  references: [
    { id: "D008", name: "Reference application, Round 17", tag: "DOCX" },
    { id: "D009", name: "Letter of support template", tag: "DOCX" },
  ],
  overall: [
    {
      label: "Compelling",
      probability: 0.71,
      question: "Would the CRC Advisory Committee find this application compelling against others in the round?",
    },
    {
      label: "Eligible",
      probability: 0.9,
      question: "Does this application meet every CRC-P eligibility requirement?",
    },
  ],
  issues: [
    {
      id: "MC-4d.1",
      ref: "MC-4d.1 · I.4",
      question:
        "Is the response to “the commercial potential of your project, including the expected commercial outputs” compelling?",
      probability: null,
    },
    {
      id: "MC-4a.3",
      ref: "MC-4a.3 · I.4",
      question: "Is the response to “whether the project could proceed without Australian Government funding” compelling?",
      probability: 0.82,
    },
    {
      id: "EL-11.3",
      ref: "EL-11.3 · G.2",
      question: "Does the application meet the requirement that the project is “industry-led”?",
      probability: 0.91,
    },
  ],
};

/** Other fixture applications: same shape, their own names, nothing added yet. */
export function fixtureView(id: string): ApplicationView {
  if (id === HARBOUR_FIXTURE.id) return HARBOUR_FIXTURE;
  const item = FIXTURE_APPLICATIONS.find((a) => a.id === id) ?? FIXTURE_APPLICATIONS[0]!;
  return {
    ...HARBOUR_FIXTURE,
    id: item.id,
    clientName: item.clientName,
    deliverables: [{ id: DRAFT_VIEW, name: "R&D application", tag: "DOCX" }],
    workflow: [
      { id: "requirements", name: "Requirements table", tag: "45 rows" },
      { id: "digest", name: "Digest table", tag: "0" },
    ],
    rfis: [],
    sharepoint: null,
    local: { path: `Grant Workbench / ${item.clientName}`, items: [] },
    references: [],
    overall: [],
    issues: [],
  };
}
