// Application folders (build spec §5.2, F-02). One folder per client application, created from a
// grant package: the package's documents and requirements table are copied in, and the copies are
// the application's own (editing them never touches the package).
import { randomUUID } from "node:crypto";
import { promises as fs, type Dirent } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { ApplicationId, GrantPackageId, Timestamp, type ApplicationSummary } from "@gw/shared";
import { removeStaleTempFiles, renameWithRetry, writeJsonAtomic } from "./atomic";
import { openDatabase, setMeta } from "./db";
import { FORM_DOCUMENT, PACKAGE_FILES, type InstalledPackage } from "./grants";
import { removeTree } from "./fs-tree";
import { writeDigestTable } from "./tables";

/** §5.2 layout. Folder names are what the advisor sees in Explorer. */
export const LAYOUT = {
  grantDocuments: "Grant documents",
  workflow: "Workflow",
  deliverables: "Deliverables",
  sources: "Sources",
  references: "References and templates",
  workbench: ".workbench",
} as const;

export const FILES = {
  requirements: path.join(LAYOUT.workflow, "requirements-table.xlsx"),
  digest: path.join(LAYOUT.workflow, "digest-table.xlsx"),
  form: path.join(LAYOUT.deliverables, "R&D application.docx"),
  database: path.join(LAYOUT.workbench, "workbench.db"),
  record: path.join(LAYOUT.workbench, "application.json"),
  sharepointLinks: path.join(LAYOUT.workbench, "sharepoint-links.json"),
  cache: path.join(LAYOUT.workbench, "cache"),
  /** The package's form map, questions and rules, as copied: the application keeps its package version (§5.1). */
  grant: path.join(LAYOUT.workbench, "grant"),
} as const;

/** `.workbench/application.json`: what the application is and which package version it was copied from. */
export const ApplicationRecord = z.object({
  formatVersion: z.literal(1),
  id: ApplicationId,
  name: z.string().min(1),
  clientName: z.string().min(1),
  packageId: GrantPackageId,
  packageName: z.string().min(1),
  packageVersion: z.string().min(1),
  createdAt: Timestamp,
});
export type ApplicationRecord = z.infer<typeof ApplicationRecord>;

export class ApplicationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApplicationError";
  }
}

// Windows file-name rules: no < > : " / \ | ? * or control characters, no trailing dot or space,
// no reserved device names.
// eslint-disable-next-line no-control-regex
const FORBIDDEN = /[<>:"/\\|?*\u0000-\u001f]/;
const RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;
// Keeps Workflow\requirements-table.xlsx inside Excel's 218-character path limit even under a
// OneDrive-redirected Documents folder.
const MAX_CLIENT_NAME = 60;

/** Validates a client name for use in a folder name; returns it tidied (inner whitespace collapsed). */
export function checkClientName(raw: string): string {
  // Trailing dots are fine ("Pty. Ltd."): the folder name ends with the grant's name, not the client's.
  const name = raw.replace(/\s+/g, " ").trim();
  if (!name) throw new ApplicationError("Enter the client's name.");
  if (FORBIDDEN.test(name)) throw new ApplicationError('The client name can\'t contain < > : " / \\ | ? *');
  if (RESERVED.test(name)) throw new ApplicationError("That name is reserved by Windows. Choose another.");
  if (name.length > MAX_CLIENT_NAME) throw new ApplicationError(`Keep the client name under ${MAX_CLIENT_NAME} characters.`);
  return name;
}

/** "Harbour Robotics – CRC-P Round 19" (en dash, §5.2). */
export function applicationName(clientName: string, packageName: string): string {
  return `${clientName} – ${packageName}`;
}

export function toSummary(record: ApplicationRecord, folder: string): ApplicationSummary {
  return {
    id: record.id,
    name: record.name,
    clientName: record.clientName,
    packageId: record.packageId,
    packageVersion: record.packageVersion,
    folder,
  };
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/** Copies a file and makes the copy writable (package files are installed read-only). */
async function copyWritable(from: string, to: string): Promise<void> {
  await fs.copyFile(from, to);
  await fs.chmod(to, 0o644);
}

/**
 * Creates an application folder from an installed package. The folder is built under a hidden
 * staging name and renamed into place at the end, so a crash never leaves a half-made application.
 */
export async function createApplicationFolder(
  applicationsRoot: string,
  pkg: InstalledPackage,
  rawClientName: string,
  now: () => Date = () => new Date(),
): Promise<{ record: ApplicationRecord; folder: string }> {
  const clientName = checkClientName(rawClientName);
  const name = applicationName(clientName, pkg.manifest.name);
  // The grant's name is package data; the folder name as a whole must still be a valid Windows name.
  if (FORBIDDEN.test(name) || /[. ]$/.test(name)) {
    throw new ApplicationError(`The grant name "${pkg.manifest.name}" can't be used in a folder name.`);
  }
  await fs.mkdir(applicationsRoot, { recursive: true });
  const folder = path.join(applicationsRoot, name);
  if (await exists(folder)) throw new ApplicationError(`"${name}" already exists.`);

  const staging = path.join(applicationsRoot, `.creating-${randomUUID()}`);
  try {
    for (const dir of Object.values(LAYOUT)) await fs.mkdir(path.join(staging, dir), { recursive: true });
    await fs.mkdir(path.join(staging, FILES.cache), { recursive: true });
    await fs.mkdir(path.join(staging, FILES.grant), { recursive: true });

    // Grant documents: every file in the package's documents/ folder, byte for byte.
    const docsDir = path.join(pkg.dir, PACKAGE_FILES.documents);
    for (const e of await fs.readdir(docsDir, { withFileTypes: true })) {
      if (e.isFile() && !e.name.startsWith(".")) {
        await copyWritable(path.join(docsDir, e.name), path.join(staging, LAYOUT.grantDocuments, e.name));
      }
    }
    await copyWritable(path.join(pkg.dir, PACKAGE_FILES.requirements), path.join(staging, FILES.requirements));
    await copyWritable(path.join(docsDir, FORM_DOCUMENT), path.join(staging, FILES.form));
    await writeDigestTable(path.join(staging, FILES.digest), []);
    for (const file of [PACKAGE_FILES.manifest, PACKAGE_FILES.formMap, PACKAGE_FILES.questions, PACKAGE_FILES.rules]) {
      await copyWritable(path.join(pkg.dir, file), path.join(staging, FILES.grant, file));
    }

    const record: ApplicationRecord = {
      formatVersion: 1,
      id: randomUUID(),
      name,
      clientName,
      packageId: pkg.manifest.id,
      packageName: pkg.manifest.name,
      packageVersion: pkg.manifest.version,
      createdAt: now().toISOString(),
    };
    await writeJsonAtomic(path.join(staging, FILES.sharepointLinks), { links: [] });

    const db = openDatabase(path.join(staging, FILES.database));
    try {
      setMeta(db, "application_id", record.id);
      setMeta(db, "package_id", record.packageId);
      setMeta(db, "package_version", record.packageVersion);
      setMeta(db, "created_at", record.createdAt);
      // Fold the WAL into the main file so the folder can be renamed with nothing held open.
      db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    } finally {
      db.close();
    }
    // Written last: a folder with an application.json is a complete application.
    await writeJsonAtomic(path.join(staging, FILES.record), record);
    // Antivirus and the search indexer briefly hold files just copied; Windows then refuses the rename.
    await renameWithRetry(staging, folder);
    return { record, folder };
  } catch (err) {
    await removeTree(staging).catch(() => {});
    // Windows reports a rename onto an existing folder as EPERM, not EEXIST.
    if (await exists(folder)) {
      throw new ApplicationError(`"${name}" already exists.`);
    }
    throw err;
  }
}

export async function readApplicationRecord(folder: string): Promise<ApplicationRecord | null> {
  try {
    const raw: unknown = JSON.parse(await fs.readFile(path.join(folder, FILES.record), "utf8"));
    const parsed = ApplicationRecord.safeParse(raw);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Every application folder under the root, sorted by name. */
export async function listApplicationFolders(
  applicationsRoot: string,
): Promise<{ record: ApplicationRecord; folder: string }[]> {
  let entries: Dirent[];
  try {
    entries = await fs.readdir(applicationsRoot, { withFileTypes: true });
  } catch {
    return [];
  }
  const found: { record: ApplicationRecord; folder: string }[] = [];
  for (const e of entries) {
    if (!e.isDirectory() || e.name.startsWith(".")) continue;
    const folder = path.join(applicationsRoot, e.name);
    const record = await readApplicationRecord(folder);
    if (record) found.push({ record, folder });
  }
  // A folder copied in Explorer carries the original's id. The folder whose name the record was
  // created with keeps it; each copy gets a new id, so the two stay separate applications.
  found.sort((a, b) => Number(isOriginal(b)) - Number(isOriginal(a)) || a.folder.localeCompare(b.folder));
  const seen = new Set<string>();
  for (const entry of found) {
    if (seen.has(entry.record.id)) {
      const stored = await readApplicationRecord(entry.folder);
      if (stored) {
        const reId = { ...stored, id: randomUUID() };
        await writeJsonAtomic(path.join(entry.folder, FILES.record), reId);
        entry.record = reId;
      }
    }
    seen.add(entry.record.id);
  }
  // The folder's own name is what the advisor sees, even after a rename or copy in Explorer.
  return found
    .map(({ record, folder }) => ({ record: { ...record, name: path.basename(folder) }, folder }))
    .sort((a, b) => a.record.name.localeCompare(b.record.name));
}

function isOriginal(entry: { record: ApplicationRecord; folder: string }): boolean {
  return path.basename(entry.folder) === entry.record.name;
}

/** Removes staging folders a crash left mid-creation. Call once at start, before any create. */
export async function removeAbandonedStaging(applicationsRoot: string): Promise<void> {
  let entries: Dirent[];
  try {
    entries = await fs.readdir(applicationsRoot, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.isDirectory() && e.name.startsWith(".creating-")) {
      // Best effort: the staging folder is hidden and never listed, so one that is still locked
      // (a crashed engine's handles not yet released) must not stop the app from starting.
      await removeTree(path.join(applicationsRoot, e.name)).catch(() => {});
    }
  }
}

/** Tidies an application folder on open: removes temp files a killed write left behind. */
export async function sweepApplicationFolder(folder: string): Promise<void> {
  for (const dir of [LAYOUT.workflow, LAYOUT.deliverables, LAYOUT.workbench]) {
    await removeStaleTempFiles(path.join(folder, dir));
  }
}
