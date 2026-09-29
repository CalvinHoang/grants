// Identifier formats used across the app (build spec §3, §5.3, §5.4).
import { z } from "zod";

/** Source document, e.g. `D003`. */
export const DocumentId = z.string().regex(/^D\d{3,}$/, "document id like D003");
/** Paragraph in the paragraph index, `D<doc>-<ordinal>`, e.g. `D003-0142` (§5.4). */
export const ParagraphId = z.string().regex(/^D\d{3,}-\d{4,}$/, "paragraph id like D003-0142");
/** Digest passage, e.g. `P-014`. */
export const PassageId = z.string().regex(/^P-\d{3,}$/, "passage id like P-014");
/**
 * Government form field, e.g. `AF-I.4`, `AF-F.4b`, `AF-D`, and declaration items like `AF-M.2(4)` (reference pack 02, 04).
 * A form item that asks two things (a Yes/No and its "If yes, describe") is split into `.1` and `.2`, e.g. `AF-G.12a.1`.
 */
export const FieldId = z.string().regex(/^AF-[A-Z](\.\d+[a-z]*(\.\d+|\(\d+\))?)?$/, "field id like AF-I.4");
/** Requirement row, e.g. `MC-4a.2`, `EL-11.3` (spec 02). Row prefixes are grant data, so the format is loose. */
export const RowId = z.string().regex(/^[A-Z]{2,4}-[0-9A-Za-z.()]+$/, "row id like MC-4a.2");
/** Decision-model question id, e.g. `DG-4`, `OV-C`, or a row-scoped id from questions.json. */
export const QuestionId = z.string().min(1);
/** Application id: the engine's opaque handle for one application folder. */
export const ApplicationId = z.string().min(1);
/** Grant package id, e.g. `crcp-r19` (§5.1). */
export const GrantPackageId = z.string().regex(/^[a-z0-9][a-z0-9-]*$/, "package id like crcp-r19");
export const RunId = z.string().min(1);
export const FlagId = z.string().min(1);

/** Anything the right panel can select: a field, a requirement row, or the whole application. Tagged, because row and field ID formats may overlap. */
export const ItemId = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("field"), id: FieldId }),
  z.object({ kind: z.literal("row"), id: RowId }),
  z.object({ kind: z.literal("overall") }),
]);

/** ISO-8601 timestamp. */
export const Timestamp = z.iso.datetime({ offset: true });

export type DocumentId = z.infer<typeof DocumentId>;
export type ParagraphId = z.infer<typeof ParagraphId>;
export type PassageId = z.infer<typeof PassageId>;
export type FieldId = z.infer<typeof FieldId>;
export type RowId = z.infer<typeof RowId>;
export type QuestionId = z.infer<typeof QuestionId>;
export type ApplicationId = z.infer<typeof ApplicationId>;
export type GrantPackageId = z.infer<typeof GrantPackageId>;
export type RunId = z.infer<typeof RunId>;
export type FlagId = z.infer<typeof FlagId>;
export type ItemId = z.infer<typeof ItemId>;
export type Timestamp = z.infer<typeof Timestamp>;
