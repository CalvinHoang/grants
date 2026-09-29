// Grant package files (build spec §5.1, §5.5). WP-12 produces them; WP-4 loads them.
import { z } from "zod";
import { FieldId, GrantPackageId, QuestionId, RowId } from "./ids";

/** manifest.json */
export const GrantManifest = z.object({
  id: GrantPackageId,
  name: z.string().min(1), // "CRC-P Round 19"
  grant: z.string().min(1), // "CRC-P"
  round: z.string().min(1),
  version: z.string().min(1),
  opened: z.string().min(1),
  closed: z.string().min(1),
  /** Every file in the package with its size and SHA-256, so a copy can be verified. */
  files: z
    .array(z.object({ path: z.string().min(1), bytes: z.number().int().min(0), sha256: z.string().regex(/^[0-9a-f]{64}$/) }))
    .optional(),
});
export type GrantManifest = z.infer<typeof GrantManifest>;

/** Field kinds (§3). */
export const FieldKind = z.enum(["narrative", "data", "confirm", "budget", "rule"]);
export type FieldKind = z.infer<typeof FieldKind>;

/** Where a field's answer box goes in the government DOCX (§5.5). */
export const FormAnchor = z.object({
  /** Exact text of the question block, found with SuperDoc findText. */
  text: z.string().min(1),
  /** Which occurrence of that text, 0-based; fallback when the text repeats. */
  ordinal: z.number().int().min(0),
});
export type FormAnchor = z.infer<typeof FormAnchor>;

/** Where the answer box sits relative to SuperDoc's top-level blocks and the DOCX's w:p paragraphs. */
export const FormPosition = z.object({
  /** Zero-based top-level body block ordinal, as SuperDoc blocks.list reports it. */
  block: z.number().int().min(0),
  /** Zero-based w:p ordinal in word/document.xml, document order (tables included). */
  paragraph: z.number().int().min(0),
});
export type FormPosition = z.infer<typeof FormPosition>;

/** One part of a field that holds several values (an address, a milestone, a contact). */
export const FormFieldPart = z.object({
  label: z.string().min(1),
  charLimit: z.number().int().positive().optional(),
  kind: FieldKind.optional(),
});
export type FormFieldPart = z.infer<typeof FormFieldPart>;

/** One entry of form-map.json. */
export const FormField = z.object({
  id: FieldId,
  label: z.string().min(1),
  /** Question text, verbatim from the form. */
  question: z.string().min(1),
  kind: FieldKind,
  /** Portal character limit (characters including spaces), null when the field has none. */
  charLimit: z.number().int().positive().nullable(),
  anchor: FormAnchor,
  /** Requirement rows this field answers. */
  rows: z.array(RowId),
  /** Fields sharing one character-limited box share a group id (§7.5 out of space). */
  sharedBoxGroup: z.string().min(1).nullable(),
  /** The question's first block; `anchor` is the block the answer box goes after. */
  questionAnchor: FormAnchor.optional(),
  /** Position of the anchor, as a fallback for `anchor.ordinal`. */
  position: FormPosition.optional(),
  /** Word bookmark name for the answer box (letters, digits, underscores; §5.5). */
  bookmark: z.string().regex(/^GW_[A-Za-z0-9_]{1,37}$/).optional(),
  /** How the portal takes the answer. */
  input: z.enum(["yes-no", "checkbox", "address", "dropdown", "number", "whole-numbers", "upload"]).optional(),
  /** The portal asks the block once per partner, person, milestone, site, priority or assistance record. */
  repeat: z.object({ per: z.string().min(1), min: z.number().int().min(0), max: z.number().int().positive().nullable() }).optional(),
  parts: z.array(FormFieldPart).optional(),
  options: z.array(z.string().min(1)).optional(),
  /** A value the form always takes (e.g. the program selection). */
  fixedValue: z.string().min(1).optional(),
  /** Asked only when another field has this answer. */
  condition: z.object({ field: FieldId, equals: z.string().min(1) }).optional(),
});
export type FormField = z.infer<typeof FormField>;

/** A character-limited portal box shared by several rows or fields (§7.5). */
export const SharedBoxGroup = z.object({
  id: z.string().min(1),
  charLimit: z.number().int().positive(),
  fields: z.array(FieldId).min(1),
  note: z.string().optional(),
});
export type SharedBoxGroup = z.infer<typeof SharedBoxGroup>;

export const FormMap = z.object({
  packageId: GrantPackageId,
  version: z.string().min(1).optional(),
  /** The government DOCX the anchors were resolved against. */
  document: z.object({ path: z.string().min(1), sha256: z.string().regex(/^[0-9a-f]{64}$/), blocks: z.number().int().positive() }).optional(),
  anchorRule: z.string().optional(),
  charCounting: z.string().optional(),
  conditionRule: z.string().optional(),
  sharedBoxGroups: z.array(SharedBoxGroup).optional(),
  fields: z.array(FormField),
});
export type FormMap = z.infer<typeof FormMap>;

/** One row of requirements-table.xlsx: exactly the five columns of spec 01 §4b. */
export const RequirementRow = z.object({
  id: RowId,
  /** Exact guideline wording, one granular piece per row. */
  wording: z.string().min(1),
  deliverable: z.string(),
  /** Form field(s) the row lands in, as written in the table (may list several). */
  formField: z.string(),
  itemsFromClient: z.string(),
});
export type RequirementRow = z.infer<typeof RequirementRow>;

/** One part of a decision-model state recipe (questions.json `stateParts` describes each type). */
export const StatePart = z.object({
  type: z.enum([
    "criterion", "subcriterion", "row", "rows", "text", "glossary", "draft", "fields", "passages",
    "reference", "project_scale", "rule_results", "gap_context", "document", "passage",
  ]),
  /** criterion or sub-criterion id */
  id: z.string().min(1).optional(),
  /** text key */
  key: z.string().min(1).optional(),
  /** glossary term */
  term: z.string().min(1).optional(),
  fields: z.array(FieldId).optional(),
  scope: z.enum(["cited", "linked"]).optional(),
  family: z.string().min(1).optional(),
  /** Dropped first (1) or second (2) when the state is over the decider's limit; absent = never dropped. */
  trim: z.union([z.literal(1), z.literal(2)]).optional(),
});
export type StatePart = z.infer<typeof StatePart>;

/** One entry of questions.json (spec 02 §A–§G). */
export const GrantQuestion = z.object({
  id: QuestionId,
  /** Row the question scores, or null for whole-application questions (OV-C, OV-E) and digest questions. */
  rowId: RowId.nullable(),
  kind: z.enum(["probability", "choice", "score"]),
  /** Statement (probability) or prompt (choice, score); `[...]` slots filled by code. */
  template: z.string().min(1),
  /** Ordered list of state parts to assemble (spec 02 §A.1): part names, or StatePart objects with their arguments. */
  stateRecipe: z.array(z.union([z.string().min(1), StatePart])),
  options: z.array(z.string().min(1)).max(255).optional(),
  /** Ordered level descriptions, lowest first. */
  rubric: z.array(z.string().min(1)).min(2).optional(),
  /** compelling · eligible · gap · digest · overall */
  family: z.string().min(1).optional(),
  askedWhen: z.string().optional(),
  /** Fields whose draft the question scores. */
  fields: z.array(FieldId).optional(),
  /** Meaning of each option and the next move code takes on it (gap type, spec 02 §D). */
  optionDetails: z.array(z.object({ value: z.string().min(1), meaning: z.string().optional(), next: z.string().optional() })).optional(),
  /** Rows that are alternatives (e.g. EL-04 company or trustee): met when any question in the group reaches the threshold. */
  anyOfGroup: z.string().min(1).optional(),
  /** DG-4: links between this and the threshold are shown as suggestions. */
  suggestFloor: z.number().min(0).max(1).optional(),
});
export type GrantQuestion = z.infer<typeof GrantQuestion>;

/** A criterion with its verbatim heading and sub-criteria (GL §6). */
export const GrantCriterion = z.object({
  id: z.string().min(1),
  field: FieldId,
  points: z.number().int().positive(),
  ref: z.string().min(1),
  heading: z.string().min(1),
  subcriteria: z.array(z.object({ id: z.string().min(1), points: z.number().int().positive(), wording: z.string().min(1) })),
});
export type GrantCriterion = z.infer<typeof GrantCriterion>;

export const GrantQuestions = z.object({
  packageId: GrantPackageId,
  version: z.string().min(1).optional(),
  stateParts: z.record(z.string(), z.string()).optional(),
  trimOrder: z.string().optional(),
  criteria: z.array(GrantCriterion).optional(),
  /** Verbatim guideline texts put into state, by key. */
  texts: z.record(z.string(), z.object({ source: z.string().min(1), ref: z.string().min(1), text: z.string().min(1) })).optional(),
  /** Verbatim Glossary definitions, by term. */
  glossary: z.record(z.string(), z.string().min(1)).optional(),
  questions: z.array(GrantQuestion),
});
export type GrantQuestions = z.infer<typeof GrantQuestions>;

/** One entry of rules.json: a code-checked eligibility rule (spec 02 §B.2). */
export const GrantRule = z.object({
  id: RowId,
  field: FieldId,
  /** Expression evaluated by the rule checker, e.g. "duration_months <= 36". */
  check: z.string().min(1),
  /** Every field the rule reads or flags; `field` is the first. */
  fields: z.array(FieldId).optional(),
  /** Requirement rows the rule decides. */
  rows: z.array(RowId).optional(),
  /** blocker: eligibility fails · advisor: flag for the advisor · form: the portal would reject it */
  onFail: z.enum(["blocker", "advisor", "form"]).optional(),
  /** When a fact is not available yet: raise Information needed, or skip. */
  onMissing: z.enum(["information-needed", "skip"]).optional(),
  /** False when v1 has no data for it (budget) — reported as not checked. */
  inScope: z.boolean().optional(),
  note: z.string().optional(),
  source: z.string().optional(),
});
export type GrantRule = z.infer<typeof GrantRule>;

/** Where a fact a rule reads comes from. */
export const RuleFact = z.object({
  from: z.enum(["field", "digest", "budget"]),
  field: FieldId.optional(),
  part: z.string().optional(),
  repeat: z.boolean().optional(),
  type: z.string().min(1),
  values: z.array(z.string()).optional(),
  item: z.record(z.string(), z.object({ field: FieldId.optional(), part: z.string().optional(), type: z.string().min(1), values: z.array(z.string()).optional() })).optional(),
  note: z.string().optional(),
});
export type RuleFact = z.infer<typeof RuleFact>;

export const GrantRules = z.object({
  packageId: GrantPackageId,
  version: z.string().min(1).optional(),
  /** The expression language of `check`. */
  language: z.record(z.string(), z.unknown()).optional(),
  facts: z.record(z.string(), RuleFact).optional(),
  rules: z.array(GrantRule),
  /** Rows this package can't check by code, and why. */
  notChecked: z.array(z.object({ id: z.string().min(1), rows: z.array(RowId), fields: z.array(FieldId), reason: z.string().min(1) })).optional(),
});
export type GrantRules = z.infer<typeof GrantRules>;
