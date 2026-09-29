// Application data types (build spec §5.3, §5.4, §7). These mirror the SQLite tables WP-4 creates;
// WP-4 owns the SQL, this module owns the shapes that cross the UI ↔ engine boundary.
import { z } from "zod";
import {
  DocumentId,
  FieldId,
  FlagId,
  ItemId,
  ParagraphId,
  PassageId,
  QuestionId,
  RowId,
  RunId,
  Timestamp,
} from "./ids";
import { ModelRole } from "./models";

// ---- documents -------------------------------------------------------------------------------

export const DocumentOrigin = z.enum(["local", "sharepoint", "reference", "grant"]);
export const DocumentStatus = z.enum(["pending", "indexed", "no-text", "error"]);
export const DocumentFormat = z.enum(["pdf", "docx", "xlsx", "md", "txt"]);

export const DocumentRecord = z.object({
  id: DocumentId,
  name: z.string().min(1),
  /** Path inside the application folder, or the SharePoint item id for linked files. */
  location: z.string().min(1),
  origin: DocumentOrigin,
  format: DocumentFormat,
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  /** Document type from DG-1; null until classified. */
  type: z.string().nullable(),
  /** Party from DG-3; null until classified. */
  party: z.string().nullable(),
  pages: z.number().int().min(0).nullable(),
  status: DocumentStatus,
  addedAt: Timestamp,
});
export type DocumentRecord = z.infer<typeof DocumentRecord>;

// ---- paragraph index (§5.4) ------------------------------------------------------------------

export const BoundingBox = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().min(0),
  height: z.number().min(0),
});

/** Location of a paragraph in its source; which parts are set depends on the format (§5.4). */
export const ParagraphLocation = z.object({
  page: z.number().int().positive().nullable(),
  sheet: z.string().nullable(),
  row: z.number().int().positive().nullable(),
  charStart: z.number().int().min(0),
  charEnd: z.number().int().min(0),
  bbox: BoundingBox.nullable(),
});

export const Paragraph = z.object({
  id: ParagraphId,
  documentId: DocumentId,
  ordinal: z.number().int().min(0),
  location: ParagraphLocation,
  /** Verbatim text. The only source of passage text anywhere in the app. */
  text: z.string(),
});
export type Paragraph = z.infer<typeof Paragraph>;

// ---- digest (§5.3 passages, passage_links; spec 01 §5.1) -------------------------------------

export const PassageOrigin = z.enum(["digest", "advisor-note", "advisor-added"]);
export const LinkStatus = z.enum(["confirmed", "suggested", "advisor-added", "rejected"]);

export const PassageLink = z.object({
  passageId: PassageId,
  rowId: RowId,
  /** Decision model's P(supports) for this link (DG-4); null for advisor-added links. */
  pSupports: z.number().min(0).max(1).nullable(),
  status: LinkStatus,
});
export type PassageLink = z.infer<typeof PassageLink>;

export const Passage = z.object({
  id: PassageId,
  /** Contiguous paragraphs the passage spans; empty for advisor notes. */
  paragraphIds: z.array(ParagraphId),
  origin: PassageOrigin,
  /** Copied by code from paragraphs.text (or the advisor's words for a note). Never model-written. */
  text: z.string(),
  /** Advisor and date, for advisor notes. */
  noteAuthor: z.string().nullable(),
  createdAt: Timestamp,
});
export type Passage = z.infer<typeof Passage>;

/** One digest-table row as the UI shows it (spec 01 §5.1). */
export const DigestRow = z.object({
  passage: Passage,
  /** Null for advisor notes. */
  documentId: DocumentId.nullable(),
  documentName: z.string().nullable(),
  documentType: z.string().nullable(),
  party: z.string().nullable(),
  /** Location of the first paragraph (page and paragraph, or sheet and row). */
  location: ParagraphLocation.nullable(),
  links: z.array(PassageLink),
  /** Read-only backlink: fields and sentence ordinals citing the passage. */
  usedIn: z.array(z.object({ fieldId: FieldId, sentence: z.number().int().min(0) })),
});
export type DigestRow = z.infer<typeof DigestRow>;

/**
 * One row of `Workflow/digest-table.xlsx` (spec 01 §5.1): one row per passage. A passage can support
 * several requirement rows, so `rowIds`, `pSupports` and `statuses` are parallel lists, one entry per
 * link. The .xlsx is the source of truth for the table's contents (§5.2); the engine rereads it on change.
 * The "Exact passage" cell is for the advisor to read: code that needs passage text takes it from the
 * paragraph index by passage ID (§5.4 verbatim rule), never from the cell.
 */
export const DigestTableRow = z.object({
  passageId: PassageId,
  /** File name and document type, as shown; "Advisor note" for notes. */
  sourceDocument: z.string(),
  /** Page and paragraph, or sheet and row. */
  location: z.string(),
  party: z.string(),
  /** Verbatim passage text, copied by code from the paragraph index. */
  passage: z.string(),
  rowIds: z.array(RowId),
  pSupports: z.array(z.number().min(0).max(1).nullable()),
  statuses: z.array(LinkStatus),
  /** Read-only backlink, e.g. "AF-I.4 s2; AF-I.2 s1". */
  usedIn: z.string(),
});
export type DigestTableRow = z.infer<typeof DigestTableRow>;

// ---- fields and drafts (§7.2, §7.3) ----------------------------------------------------------

export const FieldState = z.enum([
  "queued",
  "waiting_for_passages",
  "drafting",
  "reviewing",
  "assessing",
  "deciding",
  "final",
  "final_with_flags",
  "failed",
]);
export type FieldState = z.infer<typeof FieldState>;

export const DraftSentence = z.object({
  text: z.string().min(1),
  passageIds: z.array(PassageId),
  rowIds: z.array(RowId),
  /** Connective sentences carry no factual claim and need no citation. */
  connective: z.boolean(),
  /** A cited passage was removed or rejected after drafting (F-07); cleared by a redraft. */
  unsupported: z.boolean(),
});
export type DraftSentence = z.infer<typeof DraftSentence>;

export const Placeholder = z.object({
  rowIds: z.array(RowId).min(1),
  /** What is missing; rendered as `[Information needed: <missing> — <row IDs>]`. */
  missing: z.string().min(1),
});
export type Placeholder = z.infer<typeof Placeholder>;

// ---- model-facing structured outputs (snake_case, exactly as the spec gives them) ---------------
// The engine validates these, then maps them to the camelCase types above for storage and RPC.

/** Output of the `drafter` role and the review step (§7.3, §7.4). */
export const DraftOutput = z.object({
  sentences: z.array(
    z.object({
      text: z.string().min(1),
      passage_ids: z.array(PassageId),
      row_ids: z.array(RowId),
      connective: z.boolean(),
    }),
  ),
  placeholders: z.array(
    z.object({
      row_ids: z.array(RowId).min(1),
      missing: z.string().min(1),
    }),
  ),
});
export type DraftOutput = z.infer<typeof DraftOutput>;

/** Output of the `worker` role finding candidate passages (§7.1 step 4). IDs only, never quoted text. */
export const CandidateOutput = z.array(
  z
    .object({
      row_id: RowId.optional(),
      field_id: FieldId.optional(),
      paragraph_ids: z.array(ParagraphId).min(1),
      span_note: z.string(),
    })
    .refine((c) => (c.row_id === undefined) !== (c.field_id === undefined), "exactly one of row_id or field_id"),
);
export type CandidateOutput = z.infer<typeof CandidateOutput>;

export const FieldRecord = z.object({
  fieldId: FieldId,
  state: FieldState,
  passCount: z.number().int().min(0).max(5),
  fingerprint: z.string().nullable(),
  editedSinceAssessed: z.boolean(),
  inputsChanged: z.boolean(),
});
export type FieldRecord = z.infer<typeof FieldRecord>;

// ---- scores (§5.3 scores) --------------------------------------------------------------------

export const ScoreTarget = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("row"), fieldId: FieldId, rowId: RowId }),
  z.object({ kind: z.literal("overall"), id: z.enum(["OV-C", "OV-E"]) }),
]);

export const Score = z.object({
  target: ScoreTarget,
  questionId: QuestionId,
  /** Question text as put to the decision model; shown in the right panel. */
  question: z.string().min(1),
  modelId: z.string().min(1),
  /** Probability (0–1) for probability questions; the option for choice; the expected level for score. */
  value: z.union([z.number().min(0), z.string()]),
  confidence: z.number().min(0).max(1).nullable(),
  pass: z.number().int().min(0),
  createdAt: Timestamp,
});
export type Score = z.infer<typeof Score>;

// ---- gaps and flags (spec 02 §D, spec 01 §7, §7.5) --------------------------------------------

export const GapType = z.enum([
  "drafting",
  "evidence",
  "information",
  "conflict",
  "eligibility",
  "strategic",
  "space",
]);
export type GapType = z.infer<typeof GapType>;

export const FlagKind = z.enum([
  "below_threshold",
  "information_needed",
  "conflict",
  "advisor_decision",
  "eligibility_blocker",
  "out_of_space",
  "to_fill",
  "failed",
]);
export type FlagKind = z.infer<typeof FlagKind>;

export const Flag = z.object({
  id: FlagId,
  kind: FlagKind,
  rowIds: z.array(RowId),
  fieldIds: z.array(FieldId),
  /** Spec 01 §7 message fields. */
  informationRequired: z.string().nullable(),
  why: z.string().nullable(),
  likelySourceParty: z.string().nullable(),
  blocking: z.boolean(),
  status: z.enum(["open", "resolved"]),
});
export type Flag = z.infer<typeof Flag>;

// ---- chat, runs and calls (§5.3) --------------------------------------------------------------

export const ChatMessage = z.object({
  id: z.string().min(1),
  itemId: ItemId,
  role: z.enum(["advisor", "assistant"]),
  text: z.string(),
  createdAt: Timestamp,
  /** Redraft that consumed this message as guidance, if any. */
  usedInRedraftId: RunId.nullable(),
});
export type ChatMessage = z.infer<typeof ChatMessage>;

export const RunTrigger = z.enum(["run", "redraft", "digest", "consistency"]);
export const RunStatus = z.enum(["running", "paused", "cancelled", "completed", "failed"]);

export const RunRecord = z.object({
  id: RunId,
  trigger: RunTrigger,
  status: RunStatus,
  startedAt: Timestamp,
  finishedAt: Timestamp.nullable(),
});
export type RunRecord = z.infer<typeof RunRecord>;

/** One provider call. Metadata only: never prompt or response content (§10.3). */
export const CallRecord = z.object({
  runId: RunId.nullable(),
  /** Workflow task, e.g. "draft", "review", "assess", "digest.candidates". */
  task: z.string().min(1),
  role: ModelRole,
  provider: z.string().min(1),
  modelId: z.string().min(1),
  tokensIn: z.number().int().min(0),
  tokensOut: z.number().int().min(0),
  tokensCacheRead: z.number().int().min(0),
  tokensCacheWrite: z.number().int().min(0),
  costUsd: z.number().min(0),
  latencyMs: z.number().int().min(0),
  requestId: z.string().nullable(),
  createdAt: Timestamp,
});
export type CallRecord = z.infer<typeof CallRecord>;
