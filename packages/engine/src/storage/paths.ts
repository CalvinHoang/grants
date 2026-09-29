// Where the engine keeps things (build spec §5.1, §5.2). Single-user assumptions live here only
// (§10.5): one app data folder, one applications root in the user's Documents. A multi-user or web
// build replaces this module.
import os from "node:os";
import path from "node:path";

export interface StoragePaths {
  /** The app's own data folder (Electron userData): installed grant packages, UI state. */
  appDataDir: string;
  /** Installed grant packages, read-only: `<app data>/grants/<package id>/`. */
  grantsDir: string;
  /** Where application folders are created: `Documents\Grant Workbench`. */
  applicationsRoot: string;
  /** Grant packages shipped inside the app, copied into `grantsDir` on start; null when none ship. */
  bundledGrantsDir: string | null;
}

export const APPLICATIONS_FOLDER_NAME = "Grant Workbench";

export function storagePaths(options: {
  appDataDir: string;
  documentsDir?: string;
  bundledGrantsDir?: string | null;
}): StoragePaths {
  const documentsDir = options.documentsDir ?? path.join(os.homedir(), "Documents");
  return {
    appDataDir: options.appDataDir,
    grantsDir: path.join(options.appDataDir, "grants"),
    applicationsRoot: path.join(documentsDir, APPLICATIONS_FOLDER_NAME),
    bundledGrantsDir: options.bundledGrantsDir ?? null,
  };
}

/**
 * Paths handed to the engine process by the Electron main process (environment variables, since
 * utilityProcess.fork passes no other startup data). Null when the engine runs without storage.
 */
export function storagePathsFromEnv(env: NodeJS.ProcessEnv = process.env): StoragePaths | null {
  const appDataDir = env.GW_APP_DATA_DIR;
  if (!appDataDir) return null;
  return storagePaths({
    appDataDir,
    documentsDir: env.GW_DOCUMENTS_DIR || undefined,
    bundledGrantsDir: env.GW_BUNDLED_GRANTS_DIR || null,
  });
}
