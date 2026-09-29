// What the shell shows for one open application: the left tree (spec 03 §2) and the right panel
// summary. Built from engine records (project.*, documents.*); later packages fill in the parts
// the engine doesn't serve yet (WP-4 applications, WP-5 documents, WP-8/9 scores and issues).
import type { ApplicationSummary, DocumentRecord, GrantManifest } from "@gw/shared";

/** One clickable tree item. `id` is also the centre view key. */
export interface TreeItem {
  id: string;
  name: string;
  /** Small right-aligned tag: file format, row count, flag count, or document status. */
  tag: string;
  /** The document can't be used (no readable text, error): the tag says so in the attention colour. */
  attention?: boolean;
  /** Present for real source/reference/grant documents; workflow rows and the draft omit it. */
  document?: {
    format: DocumentRecord["format"];
    status: DocumentRecord["status"];
  };
}

export interface SourceGroup {
  /** Folder path shown under the group label, e.g. "Harbour Robotics / CRC-P". */
  path: string;
  items: TreeItem[];
}

export interface OverallScore {
  label: string;
  /** 0–1 */
  probability: number;
  question: string;
}

export interface IssueItem {
  id: string;
  /** "MC-4a.3 · I.4" */
  ref: string;
  question: string;
  /** Null for Information needed. */
  probability: number | null;
}

export interface ApplicationView {
  id: string;
  clientName: string;
  /** Short grant name for headings, e.g. "CRC-P". */
  grant: string;
  /** Grant round, e.g. "CRC-P Round 19". */
  grantRound: string;
  grantDocs: TreeItem[];
  workflow: TreeItem[];
  deliverables: TreeItem[];
  /** RFI entries under Deliverables; out of scope in v1, shown inert. */
  rfis: string[];
  sharepoint: SourceGroup | null;
  local: SourceGroup;
  references: TreeItem[];
  overall: OverallScore[];
  issues: IssueItem[];
}

export interface ApplicationListItem {
  id: string;
  clientName: string;
  grant: string;
}

export const DRAFT_VIEW = "draft";

const STATUS_TAG: Partial<Record<DocumentRecord["status"], string>> = {
  "no-text": "No readable text",
  error: "Error",
};

function docItem(doc: DocumentRecord): TreeItem {
  const status = STATUS_TAG[doc.status];
  return {
    id: doc.id,
    name: doc.name.replace(/\.(pdf|docx|xlsx|md|txt)$/i, ""),
    tag: status ?? doc.format.toUpperCase(),
    document: { format: doc.format, status: doc.status },
    ...(status ? { attention: true } : {}),
  };
}

/** Builds the tree from engine records. */
export function buildView(
  app: ApplicationSummary,
  grant: GrantManifest | undefined,
  documents: DocumentRecord[],
): ApplicationView {
  const byOrigin = (origin: DocumentRecord["origin"]) => documents.filter((d) => d.origin === origin).map(docItem);
  const sharepoint = byOrigin("sharepoint");
  return {
    id: app.id,
    clientName: app.clientName,
    grant: grant?.grant ?? app.packageId,
    grantRound: grant?.name ?? app.packageId,
    grantDocs: byOrigin("grant"),
    workflow: [
      { id: "requirements", name: "Requirements table", tag: "XLSX" },
      { id: "digest", name: "Digest table", tag: "XLSX" },
    ],
    deliverables: [{ id: DRAFT_VIEW, name: "R&D application", tag: "DOCX" }],
    rfis: [],
    sharepoint: sharepoint.length > 0 ? { path: "", items: sharepoint } : null,
    local: { path: `Grant Workbench / ${app.clientName}`, items: byOrigin("local") },
    references: byOrigin("reference"),
    overall: [],
    issues: [],
  };
}

/** Finds a tree item by id anywhere in the view. */
export function findItem(view: ApplicationView, id: string): TreeItem | undefined {
  const all = [
    ...view.grantDocs,
    ...view.workflow,
    ...view.deliverables,
    ...(view.sharepoint?.items ?? []),
    ...view.local.items,
    ...view.references,
  ];
  return all.find((i) => i.id === id);
}
