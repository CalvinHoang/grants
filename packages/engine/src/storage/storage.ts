// The engine's storage service (build spec §4.2: the engine owns every write to application folders
// and SQLite). Ties together the grant library, application folders, each application's database
// and its two .xlsx tables, and the window state restored on relaunch.
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  FormMap,
  RpcError,
  UiState,
  type ApplicationId,
  type ApplicationSummary,
  type DigestTableRow,
  type DocumentId,
  type DocumentRecord,
  type EventName,
  type EventPayload,
  type GrantManifest,
  type GrantPackageId,
  type RequirementRow,
  type TableKind,
} from "@gw/shared";
import { FileLockedError, FileReadOnlyError, writeJsonAtomic } from "./atomic";
import {
  ApplicationError,
  FILES,
  LAYOUT,
  createApplicationFolder,
  listApplicationFolders,
  readApplicationRecord,
  removeAbandonedStaging,
  sweepApplicationFolder,
  toSummary,
} from "./applications";
import { openDatabase, type Database } from "./db";
import { findPackage, installBundledPackages, listPackages, PACKAGE_FILES } from "./grants";
import type { StoragePaths } from "./paths";
import { readDigestTable, readRequirementsTable, TableFormatError, writeRequirementsTable } from "./tables";
import { FileWatcher, type FileWatcherOptions } from "./watch";

export type Emit = <E extends EventName>(event: E, payload: EventPayload<E>) => void;

const UI_STATE_FILE = "ui-state.json";
const EMPTY_UI_STATE: UiState = {
  lastApplicationId: null,
  leftWidth: null,
  rightWidth: null,
  leftOpen: null,
  rightOpen: null,
  sections: {},
};

interface TableState<Row> {
  rows: Row[];
  /** Why the file on disk couldn't be read; rows then hold the last good read. */
  error: string | null;
  watcher: FileWatcher;
}

type ViewerFormat = DocumentRecord["format"];

const FORMAT_BY_EXTENSION: Record<string, ViewerFormat> = {
  ".pdf": "pdf",
  ".docx": "docx",
  ".xlsx": "xlsx",
  ".md": "md",
  ".txt": "txt",
};

const MIME_BY_FORMAT: Record<ViewerFormat, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  md: "text/markdown",
  txt: "text/plain",
};

function grantDocumentId(index: number): DocumentId {
  return `D${9001 + index}`;
}


/** One open application: its database handle and live copies of its two tables. */
export class OpenApplication {
  private constructor(
    readonly summary: ApplicationSummary,
    readonly db: Database,
    private readonly requirements: TableState<RequirementRow>,
    private readonly digest: TableState<DigestTableRow>,
  ) {}

  static async open(
    folder: string,
    emit: Emit,
    watchOptions: FileWatcherOptions = {},
  ): Promise<OpenApplication> {
    const record = await readApplicationRecord(folder);
    if (!record) throw new ApplicationError("This folder is not a Grant Workbench application.");
    await sweepApplicationFolder(folder);
    const summary = toSummary(record, folder);
    const db = openDatabase(path.join(folder, FILES.database));

    const table = async <Row>(
      kind: TableKind,
      file: string,
      read: (file: string, bytes?: Uint8Array) => Promise<Row[]>,
    ): Promise<TableState<Row>> => {
      const state: TableState<Row> = { rows: [], error: null, watcher: null as unknown as FileWatcher };
      const load = async (bytes: Uint8Array) => {
        try {
          state.rows = await read(file, bytes);
          state.error = null;
        } catch (err) {
          state.error = err instanceof TableFormatError ? err.message : "The table could not be read.";
        }
      };
      let initial: Uint8Array | null = null;
      try {
        initial = await fs.readFile(file);
        await load(initial);
      } catch {
        state.error = "The table file is missing.";
      }
      state.watcher = new FileWatcher(
        file,
        async (bytes) => {
          await load(bytes);
          emit("table.changed", { applicationId: summary.id, table: kind });
          if (state.error) {
            emit("error", { code: "table_unreadable", message: state.error, applicationId: summary.id, flagId: null });
          }
        },
        watchOptions,
      );
      state.watcher.start(initial);
      return state;
    };

    const requirements = await table("requirements", path.join(folder, FILES.requirements), readRequirementsTable);
    const digest = await table("digest", path.join(folder, FILES.digest), readDigestTable);
    return new OpenApplication(summary, db, requirements, digest);
  }

  /** Current requirements table. Checks the file first, so a just-saved Excel edit is never missed. */
  async getRequirements(): Promise<RequirementRow[]> {
    await this.requirements.watcher.check();
    if (this.requirements.error) throw new RpcError("internal", this.requirements.error);
    return this.requirements.rows;
  }

  async saveRequirements(rows: RequirementRow[]): Promise<void> {
    const ids = new Set<string>();
    for (const r of rows) {
      if (ids.has(r.id)) throw new RpcError("invalid_params", `ID ${r.id} appears twice.`);
      ids.add(r.id);
    }
    const data = await wrap(() => writeRequirementsTable(path.join(this.summary.folder, FILES.requirements), rows));
    this.requirements.watcher.acknowledge(data);
    this.requirements.rows = rows;
    this.requirements.error = null;
  }

  /** The form map copied from the grant package when the application was created. */
  async getFormMap(): Promise<FormMap> {
    try {
      return FormMap.parse(JSON.parse(await fs.readFile(path.join(this.summary.folder, FILES.grant, PACKAGE_FILES.formMap), "utf8")));
    } catch {
      throw new RpcError("not_found", "The application's form map is missing or damaged.");
    }
  }

  async getDigestTable(): Promise<DigestTableRow[]> {
    await this.digest.watcher.check();
    if (this.digest.error) throw new RpcError("internal", this.digest.error);
    return this.digest.rows;
  }

  /** Grant documents are available immediately after WP-4 creates the application.
   * WP-5 extends documents.list with local, reference and SharePoint records later. */
  async listGrantDocuments(): Promise<DocumentRecord[]> {
    const dir = path.join(this.summary.folder, LAYOUT.grantDocuments);
    const names = (await fs.readdir(dir)).filter((name) => FORMAT_BY_EXTENSION[path.extname(name).toLowerCase()]).sort();
    const records: DocumentRecord[] = [];
    for (const [index, name] of names.entries()) {
      const file = path.join(dir, name);
      const [bytes, stat] = await Promise.all([fs.readFile(file), fs.stat(file)]);
      const format = FORMAT_BY_EXTENSION[path.extname(name).toLowerCase()]!;
      records.push({
        id: grantDocumentId(index),
        name,
        location: path.join(LAYOUT.grantDocuments, name),
        origin: "grant",
        format,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        type: null,
        party: null,
        pages: null,
        status: "pending",
        addedAt: stat.mtime.toISOString(),
      });
    }
    return records;
  }

  async readDocument(documentId: DocumentId): Promise<{ dataBase64: string; mime: string }> {
    const documents = await this.listGrantDocuments();
    const document = documents.find((item) => item.id === documentId);
    if (!document) throw new RpcError("not_found", "That document is not available.");
    const file = path.resolve(this.summary.folder, document.location);
    const root = path.resolve(this.summary.folder) + path.sep;
    if (!file.startsWith(root)) throw new RpcError("invalid_params", "The document path is outside the application.");
    const bytes = await fs.readFile(file);
    const mime = MIME_BY_FORMAT[document.format];
    return { dataBase64: bytes.toString("base64"), mime };
  }

  close(): void {
    this.requirements.watcher.close();
    this.digest.watcher.close();
    this.db.close();
  }
}

export interface StorageOptions {
  watch?: FileWatcherOptions;
}

export class Storage {
  private readonly open = new Map<ApplicationId, OpenApplication>();
  private readonly opening = new Map<ApplicationId, Promise<OpenApplication>>();
  private uiState: UiState | null = null;
  private uiWrite: Promise<unknown> = Promise.resolve();
  private listing: Promise<unknown> = Promise.resolve();

  constructor(
    readonly paths: StoragePaths,
    private readonly emit: Emit,
    private readonly options: StorageOptions = {},
  ) {}

  /** Installs the packages that ship with the app and tidies up after any crash. */
  async init(): Promise<void> {
    if (this.paths.bundledGrantsDir) {
      await installBundledPackages(this.paths.bundledGrantsDir, this.paths.grantsDir);
    }
    await removeAbandonedStaging(this.paths.applicationsRoot);
  }

  async listGrants(): Promise<GrantManifest[]> {
    // A package that fails its checks is left out of New application; say which (no client content).
    const onInvalid = (dir: string) => process.stderr.write(`engine: grant package ${path.basename(dir)} is incomplete\n`);
    return (await listPackages(this.paths.grantsDir, onInvalid)).map((p) => p.manifest);
  }

  async listApplications(): Promise<ApplicationSummary[]> {
    return (await this.listFolders()).map(({ record, folder }) => toSummary(record, folder));
  }

  async createApplication(packageId: GrantPackageId, clientName: string): Promise<ApplicationSummary> {
    const pkg = await findPackage(this.paths.grantsDir, packageId);
    if (!pkg) throw new RpcError("invalid_params", "That grant is not installed.");
    const { record, folder } = await wrap(() => createApplicationFolder(this.paths.applicationsRoot, pkg, clientName));
    return toSummary(record, folder);
  }

  /** Lists application folders one call at a time: listing may give a copied folder a new id. */
  private listFolders(): ReturnType<typeof listApplicationFolders> {
    const next = this.listing.then(() => listApplicationFolders(this.paths.applicationsRoot));
    this.listing = next.catch(() => {});
    return next;
  }

  /** Opens an application (kept open while the engine runs, so switching keeps its state). */
  async openApplication(id: ApplicationId): Promise<OpenApplication> {
    const already = this.open.get(id);
    if (already) return already;
    const pending = this.opening.get(id);
    if (pending) return pending;
    // Overlapping RPCs share one open. A second open must not sweep temporary files that
    // the first handle may already be writing, or create duplicate watchers/database handles.
    const opening = (async () => {
      const found = (await this.listFolders()).find((a) => a.record.id === id);
      if (!found) throw new RpcError("invalid_params", "That application no longer exists.");
      const app = await wrap(() => OpenApplication.open(found.folder, this.emit, this.options.watch));
      this.open.set(id, app);
      return app;
    })();
    this.opening.set(id, opening);
    try {
      return await opening;
    } finally {
      this.opening.delete(id);
    }
  }

  /** Opens an application and records it as the last one open (restored on relaunch). */
  async openAndRemember(id: ApplicationId): Promise<ApplicationSummary> {
    const app = await this.openApplication(id);
    await this.setUiState({ lastApplicationId: id });
    return app.summary;
  }

  async getUiState(): Promise<UiState> {
    if (this.uiState) return this.uiState;
    try {
      const raw: unknown = JSON.parse(await fs.readFile(path.join(this.paths.appDataDir, UI_STATE_FILE), "utf8"));
      this.uiState = UiState.catch(EMPTY_UI_STATE).parse(raw);
    } catch {
      this.uiState = EMPTY_UI_STATE;
    }
    return this.uiState;
  }

  async setUiState(patch: Partial<UiState>): Promise<UiState> {
    // Serialise the read/merge/write, not only the disk write: two concurrent panel updates
    // must not both merge against the same old state and discard one another.
    const write = this.uiWrite.then(async () => {
      const next = { ...(await this.getUiState()), ...patch };
      await fs.mkdir(this.paths.appDataDir, { recursive: true });
      await writeJsonAtomic(path.join(this.paths.appDataDir, UI_STATE_FILE), next);
      this.uiState = next;
      return next;
    });
    this.uiWrite = write.catch(() => {});
    return write;
  }

  close(): void {
    for (const app of this.open.values()) app.close();
    this.open.clear();
  }
}

/** Turns storage errors meant for the advisor into RPC errors that carry their message. */
async function wrap<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (
      err instanceof ApplicationError ||
      err instanceof TableFormatError ||
      err instanceof FileLockedError ||
      err instanceof FileReadOnlyError
    ) {
      throw new RpcError("invalid_params", err.message);
    }
    throw err;
  }
}
