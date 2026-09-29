// Crash-safe file writes (build spec §10.4): write a temp file next to the target, flush it to disk,
// then rename it over the target. A process killed at any point leaves either the old file or the
// new one, never a torn one. Leftover temp files are swept by `removeStaleTempFiles`.
import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

/** Temp files are hidden, next to their target (same volume, so rename is atomic), and easy to sweep. */
export const TEMP_SUFFIX = ".gw-tmp";

function tempPathFor(target: string): string {
  return path.join(path.dirname(target), `.${path.basename(target)}.${randomBytes(6).toString("hex")}${TEMP_SUFFIX}`);
}

/** Windows refuses to replace a file another program holds open (Excel, antivirus, indexer). */
const RETRYABLE = new Set(["EPERM", "EBUSY", "EACCES"]);

export async function renameWithRetry(from: string, to: string): Promise<void> {
  const delays = [20, 50, 100, 200, 400, 800];
  for (let attempt = 0; ; attempt++) {
    try {
      await fs.rename(from, to);
      return;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code ?? "";
      const delay = delays[attempt];
      if (!RETRYABLE.has(code) || delay === undefined) throw err;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

/** Makes the rename itself durable. Directories can't be opened for fsync on Windows; NTFS journals it. */
async function syncDir(dir: string): Promise<void> {
  if (process.platform === "win32") return;
  const handle = await fs.open(dir, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

export class FileLockedError extends Error {
  constructor(readonly file: string) {
    super(`${path.basename(file)} is open in another program. Close it and try again.`);
    this.name = "FileLockedError";
  }
}

export class FileReadOnlyError extends Error {
  constructor(readonly file: string) {
    super(`${path.basename(file)} is set to read-only. Clear its read-only setting and try again.`);
    this.name = "FileReadOnlyError";
  }
}

/** Atomically replaces (or creates) `target` with `data`. */
export async function writeFileAtomic(target: string, data: Uint8Array | string): Promise<void> {
  const temp = tempPathFor(target);
  const handle = await fs.open(temp, "wx");
  try {
    await handle.writeFile(data);
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await renameWithRetry(temp, target);
  } catch (err) {
    await fs.rm(temp, { force: true });
    if (RETRYABLE.has((err as NodeJS.ErrnoException).code ?? "")) {
      const mode = await fs.stat(target).then((st) => st.mode, () => null);
      if (mode !== null && (mode & 0o200) === 0) throw new FileReadOnlyError(target);
      throw new FileLockedError(target);
    }
    throw err;
  }
  await syncDir(path.dirname(target));
}

export async function writeJsonAtomic(target: string, value: unknown): Promise<void> {
  await writeFileAtomic(target, JSON.stringify(value, null, 2) + "\n");
}

/** Deletes temp files a killed write left behind in `dir` (not recursive). */
export async function removeStaleTempFiles(dir: string): Promise<number> {
  let removed = 0;
  let names: string[];
  try {
    names = await fs.readdir(dir);
  } catch {
    return 0;
  }
  for (const name of names) {
    if (name.startsWith(".") && name.endsWith(TEMP_SUFFIX)) {
      await fs.rm(path.join(dir, name), { force: true });
      removed++;
    }
  }
  return removed;
}

export function isTempFile(name: string): boolean {
  return name.endsWith(TEMP_SUFFIX);
}
