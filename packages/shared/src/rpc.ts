// UI ↔ engine contract (build spec §4.2): every request method and event, with its payload schemas.
// Both sides import this module; `rpc-runtime.ts` validates every payload on receipt.
//
// Methods beyond `settings.engineInfo` are declared here so later work packages share one list;
// the engine answers `not_implemented` until the owning package builds them.
import { z } from "zod";
import {
  DigestRow,
  DocumentRecord,
  Flag,
  ChatMessage,
  FieldRecord,
  Passage,
  Score,
  DraftSentence,
  Placeholder,
  LinkStatus,
  RunRecord,
  CallRecord,
  Paragraph,
  DigestTableRow,
} from "./data";
import { FormMap, GrantManifest, RequirementRow } from "./grant";
import {
  ApplicationId,
  DocumentId,
  FieldId,
  FlagId,
  GrantPackageId,
  ItemId,
  ParagraphId,
  PassageId,
  RowId,
  RunId,
} from "./ids";
import { ModelRole, ModelsConfig } from "./models";
import { Capabilities, ProviderErrorKind } from "./llm";

const Empty = z.object({});
const Ok = z.object({ ok: z.literal(true) });

export const ApplicationSummary = z.object({
  id: ApplicationId,
  name: z.string().min(1), // "Harbour Robotics – CRC-P Round 19"
  clientName: z.string().min(1),
  packageId: GrantPackageId,
  packageVersion: z.string().min(1),
  folder: z.string().min(1),
});
export type ApplicationSummary = z.infer<typeof ApplicationSummary>;

export const EngineInfo = z.object({
  engineVersion: z.string().min(1),
  schemaVersion: z.number().int().positive(),
  node: z.string().min(1),
  sqlite: z.string().nullable(),
  platform: z.string().min(1),
  /**
   * Where provider keys live. `credential-manager`: Windows Credential Manager via the OS keyring,
   * checked with a write, read and delete in the engine process. `memory`: kept for this session
   * only (tests, and Linux where no keyring loads). `unavailable`: Windows, but Credential Manager
   * couldn't be opened; saving a key fails. Keys are never written to a file.
   */
  keyStore: z.enum(["credential-manager", "memory", "unavailable"]),
  /** Engine process id, for diagnostics and the restart test. */
  pid: z.number().int().positive(),
});
export type EngineInfo = z.infer<typeof EngineInfo>;

export const FieldDetail = z.object({
  field: FieldRecord,
  sentences: z.array(DraftSentence),
  placeholders: z.array(Placeholder),
  scores: z.array(Score),
  flags: z.array(Flag),
  passages: z.array(Passage),
});
export type FieldDetail = z.infer<typeof FieldDetail>;

/**
 * Window layout the app restores on relaunch (F-02 AC3). The engine stores it in the app data folder;
 * the UI owns what the values mean.
 */
export const UiState = z.object({
  lastApplicationId: ApplicationId.nullable(),
  leftWidth: z.number().min(0).nullable(),
  rightWidth: z.number().min(0).nullable(),
  leftOpen: z.boolean().nullable(),
  rightOpen: z.boolean().nullable(),
  sections: z.record(z.string(), z.boolean()),
});
export type UiState = z.infer<typeof UiState>;

/** The two .xlsx tables in an application's Workflow folder (§5.2). */
export const TableKind = z.enum(["requirements", "digest"]);
export type TableKind = z.infer<typeof TableKind>;

const App = { applicationId: ApplicationId };

export const ProviderInfo = z.object({
  id: z.string().min(1),
  /** Whether a key is stored. Providers signed in through Microsoft (Copilot) report false. */
  hasKey: z.boolean(),
  models: z.array(z.object({ id: z.string().min(1), capabilities: Capabilities })),
});
export type ProviderInfo = z.infer<typeof ProviderInfo>;

export const RoleTestResult = z.object({
  ok: z.boolean(),
  role: ModelRole,
  provider: z.string().min(1),
  modelId: z.string().min(1),
  latencyMs: z.number().int().min(0),
  error: z.object({ kind: z.union([ProviderErrorKind, z.literal("invalid_output")]), message: z.string() }).nullable(),
});
export type RoleTestResult = z.infer<typeof RoleTestResult>;

export const UsageSummary = z.object({
  calls: z.number().int().min(0),
  costUsd: z.number().min(0),
  byRole: z.partialRecord(ModelRole, z.number().min(0)),
  /** The most recent calls, newest first (metadata only). */
  recent: z.array(CallRecord),
});
export type UsageSummary = z.infer<typeof UsageSummary>;

/** Bump when a method or event payload changes incompatibly. */
export const SCHEMA_VERSION = 1;

interface MethodSpec {
  params: z.ZodType;
  result: z.ZodType;
  /**
   * Client-side timeout when the method can legitimately take a while. Default 30 s.
   * Long jobs (run, redraft, digest) return an id at once and report through events instead.
   */
  timeoutMs?: number;
}

/** Request methods: name → params and result schemas. */
export const methods = {
  // project.* — grant library and applications (F-02, WP-4)
  "project.listGrants": { params: Empty, result: z.object({ grants: z.array(GrantManifest) }) },
  "project.list": { params: Empty, result: z.object({ applications: z.array(ApplicationSummary) }) },
  "project.create": {
    params: z.object({ packageId: GrantPackageId, clientName: z.string().trim().min(1) }),
    result: ApplicationSummary,
  },
  "project.open": { params: z.object(App), result: ApplicationSummary },
  /** The application's own requirements table (F-06). */
  "project.requirements": { params: z.object(App), result: z.object({ rows: z.array(RequirementRow) }) },
  /** Replaces the application's requirements table; labels affected fields "Inputs changed", no model call (D21). */
  "project.setRequirements": { params: z.object({ ...App, rows: z.array(RequirementRow) }), result: Ok },
  /** The form map of the application's grant package (§5.1, §5.5). */
  "project.formMap": { params: z.object(App), result: FormMap },

  // documents.* — sources and references (F-03, F-04, WP-5)
  "documents.list": { params: z.object(App), result: z.object({ documents: z.array(DocumentRecord) }) },
  "documents.add": {
    timeoutMs: 120_000,
    params: z.object({
      ...App,
      paths: z.array(z.string().min(1)).min(1),
      target: z.enum(["sources", "references"]),
    }),
    result: z.object({ documents: z.array(DocumentRecord) }),
  },
  "documents.linkSharePoint": {
    // Includes the Microsoft sign-in in the system browser.
    timeoutMs: 300_000,
    params: z.object({ ...App, folderUrl: z.string().url() }),
    result: z.object({ documents: z.array(DocumentRecord) }),
  },
  /** Paragraphs of one document, in order, for viewers and "Add to digest" (§5.4). */
  "documents.paragraphs": {
    params: z.object({
      ...App,
      documentId: DocumentId,
      offset: z.number().int().min(0).default(0),
      limit: z.number().int().positive().max(5000).default(1000),
    }),
    result: z.object({ paragraphs: z.array(Paragraph), total: z.number().int().min(0) }),
  },
  /** Raw bytes for the in-app format-native viewer. Engine validates the document id/path. */
  "documents.read": {
    params: z.object({ ...App, documentId: DocumentId }),
    result: z.object({
      dataBase64: z.string(),
      mime: z.string().min(1),
    }),
  },
  "documents.remove": { params: z.object({ ...App, documentId: DocumentId }), result: Ok },

  // digest.* — digest table (F-05, F-07, WP-7, WP-10)
  "digest.get": { params: z.object(App), result: z.object({ rows: z.array(DigestRow) }) },
  /** The digest table as stored in Workflow/digest-table.xlsx (§5.2). */
  "digest.getTable": { params: z.object(App), result: z.object({ rows: z.array(DigestTableRow) }) },
  "digest.addPassage": {
    params: z.object({
      ...App,
      paragraphIds: z.array(ParagraphId).min(1),
      rowIds: z.array(RowId).min(1),
    }),
    result: DigestRow,
  },
  "digest.addAdvisorNote": {
    params: z.object({ ...App, text: z.string().trim().min(1), rowIds: z.array(RowId) }),
    result: DigestRow,
  },
  "digest.setLinkStatus": {
    params: z.object({ ...App, passageId: PassageId, rowId: RowId, status: LinkStatus }),
    result: DigestRow,
  },
  "digest.removePassage": { params: z.object({ ...App, passageId: PassageId }), result: Ok },

  // run.* — the drafting loop (F-09, WP-8)
  "run.start": { params: z.object(App), result: z.object({ runId: RunId }) },
  "run.cancel": { params: z.object({ ...App, runId: RunId }), result: Ok },
  "run.status": { params: z.object(App), result: z.object({ run: RunRecord.nullable() }) },

  // field.* — per-field detail, advisor edits and redrafts (F-11, F-12, F-13, WP-8, WP-9)
  "field.get": { params: z.object({ ...App, fieldId: FieldId }), result: FieldDetail },
  "field.explain": {
    timeoutMs: 120_000,
    params: z.object({ ...App, fieldId: FieldId, rowId: RowId }),
    result: z.object({ weak: z.string(), fix: z.string() }),
  },
  /** Records an advisor edit. Never starts a model call (D24). */
  "field.edited": { params: z.object({ ...App, fieldId: FieldId, text: z.string() }), result: FieldRecord },
  /** Draft or Redraft; no fieldIds means Redraft all. */
  "field.redraft": {
    params: z.object({ ...App, fieldIds: z.array(FieldId).optional(), guidance: z.string().optional() }),
    result: z.object({ runId: RunId }),
  },
  "field.setConfirm": {
    params: z.object({ ...App, fieldId: FieldId, value: z.string() }),
    result: FieldRecord,
  },

  // chat.* — chat answers only; changes happen through Draft/Redraft (D13, WP-9)
  "chat.send": {
    timeoutMs: 300_000,
    params: z.object({ ...App, itemId: ItemId, text: z.string().trim().min(1), model: z.string().optional() }),
    result: z.object({ message: ChatMessage, reply: ChatMessage }),
  },
  "chat.history": {
    params: z.object({ ...App, itemId: ItemId }),
    result: z.object({ messages: z.array(ChatMessage) }),
  },

  // export.* — clean copy (F-15, WP-3)
  "export.docx": {
    timeoutMs: 120_000,
    params: z.object({ ...App, outputPath: z.string().min(1) }),
    result: z.object({ path: z.string().min(1) }),
  },
  "export.pdf": {
    // Word converts the DOCX in the background (§4.1).
    timeoutMs: 300_000,
    params: z.object({ ...App, outputPath: z.string().min(1) }),
    result: z.object({ path: z.string().min(1) }),
  },

  // settings.* — engine info, models, keys (F-16, WP-6)
  "settings.engineInfo": { params: Empty, result: EngineInfo },
  "settings.getUiState": { params: Empty, result: UiState },
  /** Merges the given parts into the stored state. */
  "settings.setUiState": { params: UiState.partial(), result: UiState },
  "settings.getModels": { params: Empty, result: ModelsConfig },
  "settings.setModels": { params: ModelsConfig, result: Ok },
  /** Stores a provider key in Windows Credential Manager; the key is never echoed back. */
  "settings.setKey": {
    params: z.object({ provider: z.string().min(1), key: z.string().min(1) }),
    result: Ok,
  },
  "settings.hasKey": {
    params: z.object({ provider: z.string().min(1) }),
    result: z.object({ present: z.boolean() }),
  },
  "settings.deleteKey": { params: z.object({ provider: z.string().min(1) }), result: Ok },
  /** Providers in models.json with each offered model's capabilities (the Settings pickers). */
  "settings.providers": { params: Empty, result: z.object({ providers: z.array(ProviderInfo) }) },
  /** One small call through a role's current mapping, to check the key and model work. */
  "settings.testRole": { params: z.object({ role: ModelRole }), result: RoleTestResult },
  "settings.usage": { params: Empty, result: UsageSummary },
  /** Releases calls held after a provider's spend cap, once the advisor has raised it. */
  "settings.resumeProvider": { params: z.object({ provider: z.string().min(1) }), result: Ok },
} as const satisfies Record<string, MethodSpec>;

export type MethodName = keyof typeof methods;
export type MethodParams<M extends MethodName> = z.input<(typeof methods)[M]["params"]>;
export type MethodResult<M extends MethodName> = z.output<(typeof methods)[M]["result"]>;

/** Events the engine streams to the UI (§4.2). */
export const events = {
  progress: z.object({
    applicationId: ApplicationId.nullable(),
    runId: RunId.nullable(),
    /** One quiet line for the top of the right panel, e.g. "34 of 60 fields done". */
    line: z.string(),
    done: z.number().int().min(0).nullable(),
    total: z.number().int().min(0).nullable(),
  }),
  "field.final": z.object({
    applicationId: ApplicationId,
    fieldId: FieldId,
    field: FieldRecord,
    sentences: z.array(DraftSentence),
    placeholders: z.array(Placeholder),
    /** Sentence ordinals linked to rows below threshold: yellow highlight (§5.5). */
    highlight: z.array(z.number().int().min(0)),
  }),
  "flag.changed": z.object({ applicationId: ApplicationId, flag: Flag }),
  "digest.updated": z.object({ applicationId: ApplicationId, passageIds: z.array(PassageId) }),
  /** A workflow table changed on disk outside the engine and has been reread (§5.2). */
  "table.changed": z.object({ applicationId: ApplicationId, table: TableKind }),
  "document.indexed": z.object({ applicationId: ApplicationId, document: DocumentRecord }),
  "usage.updated": z.object({
    applicationId: ApplicationId.nullable(),
    runId: RunId.nullable(),
    costUsd: z.number().min(0),
    byRole: z.partialRecord(ModelRole, z.number().min(0)),
  }),
  error: z.object({
    code: z.string().min(1),
    message: z.string(),
    applicationId: ApplicationId.nullable(),
    flagId: FlagId.nullable(),
  }),
} as const satisfies Record<string, z.ZodType>;

export type EventName = keyof typeof events;
export type EventPayload<E extends EventName> = z.output<(typeof events)[E]>;

// ---- wire envelopes -------------------------------------------------------------------------

/**
 * Error codes the RPC layer itself produces. Handlers may add domain codes (e.g. "not_found",
 * "spend_cap", "offline"), so the wire accepts any string and clients must tolerate unknown codes.
 */
export const RpcErrorCode = z.enum([
  "invalid_message",
  "unknown_method",
  "invalid_params",
  "invalid_result",
  "not_implemented",
  "internal",
  "timeout",
  "closed",
]);
export type RpcErrorCode = z.infer<typeof RpcErrorCode>;

export const RpcRequest = z.object({
  type: z.literal("request"),
  id: z.number().int().min(0),
  method: z.string(),
  params: z.unknown(),
});
export const RpcResponse = z.discriminatedUnion("ok", [
  z.object({ type: z.literal("response"), id: z.number().int().min(0), ok: z.literal(true), result: z.unknown() }),
  z.object({
    type: z.literal("response"),
    id: z.number().int().min(0),
    ok: z.literal(false),
    error: z.object({ code: z.string().min(1), message: z.string() }),
  }),
]);
export const RpcEvent = z.object({ type: z.literal("event"), event: z.string(), payload: z.unknown() });
export const RpcMessage = z.union([RpcRequest, RpcResponse, RpcEvent]);

export type RpcRequest = z.infer<typeof RpcRequest>;
export type RpcResponse = z.infer<typeof RpcResponse>;
export type RpcEvent = z.infer<typeof RpcEvent>;
export type RpcMessage = z.infer<typeof RpcMessage>;
