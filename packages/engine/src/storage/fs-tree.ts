// Folder helpers that behave the same on Windows: read-only files (the read-only attribute) block
// deletion there, and a file another process just released can stay locked for a moment.
import { promises as fs } from "node:fs";
import path from "node:path";

export async function setTreeMode(dir: string, fileMode: number, dirMode: number): Promise<void> {
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) await setTreeMode(p, fileMode, dirMode);
    else await fs.chmod(p, fileMode);
  }
  await fs.chmod(dir, dirMode);
}

/** Read-only: files 0444 (the Windows read-only attribute); folders stay traversable. */
export const makeReadOnly = (dir: string) => setTreeMode(dir, 0o444, 0o755);
export const makeWritable = (dir: string) => setTreeMode(dir, 0o644, 0o755);

/** Deletes a folder tree, clearing read-only files first and retrying briefly on locked files. */
export async function removeTree(dir: string): Promise<void> {
  try {
    await makeWritable(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
    // Carry on: rm may still manage, and reports the real problem if not.
  }
  await fs.rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
