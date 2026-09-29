// The engine: owns application folders, SQLite and every model call (build spec §4).
// WP-0 wires the RPC server; later packages add handlers for their methods.
import type { DatabaseSync as DatabaseSyncClass } from "node:sqlite";
import { createRpcServer, RpcError, SCHEMA_VERSION, type Handlers, type RpcServer } from "@gw/shared";
import pkg from "../package.json" with { type: "json" };
import { createModelServices, spendCapEvent, type ModelServices, type ModelServicesOptions } from "./models";
import { Storage, type Emit, type StorageOptions } from "./storage/storage";
import type { StoragePaths } from "./storage/paths";

function sqliteVersion(): string | null {
  try {
    // node:sqlite is built in (§4.1). Loaded lazily so the engine still starts if it is missing.
    const { DatabaseSync } = process.getBuiltinModule("node:sqlite") as { DatabaseSync: typeof DatabaseSyncClass };
    const db = new DatabaseSync(":memory:");
    const row = db.prepare("select sqlite_version() as v").get() as { v: string };
    db.close();
    return row.v;
  } catch {
    return null;
  }
}

/** Storage handlers (F-02, WP-4). Every call waits for startup (package install, crash sweep). */
function storageHandlers(storage: Storage, ready: Promise<void>): Handlers {
  const withReady =
    <P, R>(fn: (params: P) => Promise<R>) =>
    async (params: P): Promise<R> => {
      await ready;
      return fn(params);
    };
  const app = (id: string) => storage.openApplication(id);
  return {
    "project.listGrants": withReady(async () => ({ grants: await storage.listGrants() })),
    "project.list": withReady(async () => ({ applications: await storage.listApplications() })),
    "project.create": withReady(({ packageId, clientName }) => storage.createApplication(packageId, clientName)),
    "project.open": withReady(({ applicationId }) => storage.openAndRemember(applicationId)),
    "project.requirements": withReady(async ({ applicationId }) => ({
      rows: await (await app(applicationId)).getRequirements(),
    })),
    "project.setRequirements": withReady(async ({ applicationId, rows }) => {
      await (await app(applicationId)).saveRequirements(rows);
      return { ok: true as const };
    }),
    "project.formMap": withReady(async ({ applicationId }) => (await app(applicationId)).getFormMap()),
    "documents.list": withReady(async ({ applicationId }) => ({
      documents: await (await app(applicationId)).listGrantDocuments(),
    })),
    "documents.read": withReady(async ({ applicationId, documentId }) => (await app(applicationId)).readDocument(documentId)),
    "digest.getTable": withReady(async ({ applicationId }) => ({
      rows: await (await app(applicationId)).getDigestTable(),
    })),
    "settings.getUiState": withReady(() => storage.getUiState()),
    "settings.setUiState": withReady((patch) => storage.setUiState(patch)),
  };
}

export function createHandlers(models: ModelServices, storage?: { storage: Storage; ready: Promise<void> }): Handlers {
  return {
    "settings.engineInfo": () => ({
      engineVersion: pkg.version,
      schemaVersion: SCHEMA_VERSION,
      node: process.versions.node,
      sqlite: sqliteVersion(),
      platform: process.platform,
      keyStore: models.keys.kind,
      pid: process.pid,
    }),
    ...models.handlers,
    ...(storage ? storageHandlers(storage.storage, storage.ready) : {}),
  };
}

export interface EngineOptions extends Omit<ModelServicesOptions, "onPause"> {
  /** Where packages and applications live; without it, storage methods answer not_implemented. */
  paths?: StoragePaths | null;
  storage?: StorageOptions;
}

export interface Engine extends RpcServer {
  storage: Storage | null;
  /** Resolves when startup work (installing grant packages, crash sweep) has finished. */
  ready: Promise<void>;
  close(): void;
}

/**
 * Creates the engine once per process. Each UI connection (a fresh port after a page reload or an
 * engine restart) is attached to the same server, so state and running jobs survive reconnects and
 * events reach whichever windows are connected. Without options (tests) models.json and keys are
 * kept in memory.
 */
export function createEngine(options: EngineOptions = { keyStore: "memory" }): Engine {
  let server: RpcServer | null = null;

  // Storage emits through the same RPC server as model services.
  const emit: Emit = (event, payload) => server?.emit(event, payload);
  const storage = options.paths ? new Storage(options.paths, emit, options.storage) : null;
  const ready = (storage ? storage.init() : Promise.resolve()).catch((err: unknown) => {
    process.stderr.write("engine: storage failed to start\n");
    throw new RpcError("storage_unavailable", `Storage failed to start: ${err instanceof Error ? err.message : "unknown error"}`);
  });
  ready.catch(() => {});

  const models = createModelServices({
    ...options,
    // A provider's spend cap holds its calls until the advisor resumes (§7.8).
    onPause: (provider) => server?.emit("error", spendCapEvent(provider)),
  });
  const rpc = createRpcServer(createHandlers(models, storage ? { storage, ready } : undefined), {
    // Method name only: error messages may carry client paths or content (§10.3).
    onInternalError: (method) => process.stderr.write(`engine: ${method} failed\n`),
  });
  server = rpc;
  return {
    attach: (transport) => rpc.attach(transport),
    emit: (event, payload) => rpc.emit(event, payload),
    storage,
    ready,
    close: () => storage?.close(),
  };
}
