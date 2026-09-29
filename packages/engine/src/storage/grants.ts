// Grant library (build spec §5.1, spec 04 §10): each grant round is a package of files, read-only in
// the app data folder. Packages ship inside the app and are installed into the app data folder on
// start. Grants are data, not code: a grant appears under New application once its package exists.
import { promises as fs, type Dirent } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import {
  FormMap,
  GrantManifest,
  GrantQuestions,
  GrantRules,
  type GrantPackageId,
  type RequirementRow,
} from "@gw/shared";
import type { z } from "zod";
import { makeReadOnly, removeTree } from "./fs-tree";
import { readRequirementsTable } from "./tables";

export const PACKAGE_FILES = {
  manifest: "manifest.json",
  documents: "documents",
  requirements: "requirements-table.xlsx",
  formMap: "form-map.json",
  questions: "questions.json",
  rules: "rules.json",
} as const;

/** The government form inside `documents/`; its working copy becomes the application's deliverable. */
export const FORM_DOCUMENT = "application-form.docx";

export interface InstalledPackage {
  manifest: GrantManifest;
  dir: string;
}

export interface GrantPackage extends InstalledPackage {
  requirements: RequirementRow[];
  formMap: FormMap;
  questions: GrantQuestions;
  rules: GrantRules;
  /** File names under documents/. */
  documents: string[];
}

export class GrantPackageError extends Error {
  constructor(
    readonly dir: string,
    message: string,
  ) {
    super(`Grant package ${path.basename(dir)}: ${message}`);
    this.name = "GrantPackageError";
  }
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function readJson<T extends z.ZodType>(dir: string, file: string, schema: T): Promise<z.output<T>> {
  let raw: unknown;
  try {
    raw = JSON.parse(await fs.readFile(path.join(dir, file), "utf8"));
  } catch {
    throw new GrantPackageError(dir, `${file} is missing or not valid JSON.`);
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new GrantPackageError(dir, `${file}: ${issue?.path.join(".") || "(root)"}: ${issue?.message}`);
  }
  return parsed.data;
}

async function listFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries.filter((e) => e.isFile() && !e.name.startsWith(".")).map((e) => e.name).sort();
}

/**
 * Checks a package's shape cheaply (manifest valid, every §5.1 file present). Returns its manifest.
 * The package directory name must equal the manifest id.
 */
export async function checkPackage(dir: string): Promise<GrantManifest> {
  const manifest = await readJson(dir, PACKAGE_FILES.manifest, GrantManifest);
  if (manifest.id !== path.basename(dir)) {
    throw new GrantPackageError(dir, `manifest id "${manifest.id}" does not match its folder name.`);
  }
  for (const file of [PACKAGE_FILES.requirements, PACKAGE_FILES.formMap, PACKAGE_FILES.questions, PACKAGE_FILES.rules]) {
    if (!(await exists(path.join(dir, file)))) throw new GrantPackageError(dir, `${file} is missing.`);
  }
  if (!(await exists(path.join(dir, PACKAGE_FILES.documents, FORM_DOCUMENT)))) {
    throw new GrantPackageError(dir, `${PACKAGE_FILES.documents}/${FORM_DOCUMENT} is missing.`);
  }
  return manifest;
}

/** Loads and validates everything in a package. */
export async function loadPackage(dir: string): Promise<GrantPackage> {
  const manifest = await checkPackage(dir);
  const [formMap, questions, rules] = await Promise.all([
    readJson(dir, PACKAGE_FILES.formMap, FormMap),
    readJson(dir, PACKAGE_FILES.questions, GrantQuestions),
    readJson(dir, PACKAGE_FILES.rules, GrantRules),
  ]);
  for (const [file, id] of [
    [PACKAGE_FILES.formMap, formMap.packageId],
    [PACKAGE_FILES.questions, questions.packageId],
    [PACKAGE_FILES.rules, rules.packageId],
  ] as const) {
    if (id !== manifest.id) throw new GrantPackageError(dir, `${file} is for package "${id}", not "${manifest.id}".`);
  }
  let requirements: RequirementRow[];
  try {
    requirements = await readRequirementsTable(path.join(dir, PACKAGE_FILES.requirements));
  } catch (err) {
    throw new GrantPackageError(dir, `${PACKAGE_FILES.requirements}: ${(err as Error).message}`);
  }
  const documents = await listFiles(path.join(dir, PACKAGE_FILES.documents));
  return { manifest, dir, requirements, formMap, questions, rules, documents };
}

/** Every valid package installed in `grantsDir`, sorted by name. Invalid ones are skipped and reported. */
export async function listPackages(
  grantsDir: string,
  onInvalid: (dir: string, err: Error) => void = () => {},
): Promise<InstalledPackage[]> {
  let entries: Dirent[];
  try {
    entries = await fs.readdir(grantsDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const found: InstalledPackage[] = [];
  for (const e of entries) {
    if (!e.isDirectory() || e.name.startsWith(".")) continue;
    const dir = path.join(grantsDir, e.name);
    try {
      found.push({ manifest: await checkPackage(dir), dir });
    } catch (err) {
      onInvalid(dir, err as Error);
    }
  }
  return found.sort((a, b) => a.manifest.name.localeCompare(b.manifest.name));
}

export async function findPackage(grantsDir: string, id: GrantPackageId): Promise<InstalledPackage | null> {
  const dir = path.join(grantsDir, id);
  if (!(await exists(dir))) return null;
  return { manifest: await checkPackage(dir), dir };
}

// ---- install ---------------------------------------------------------------------------------

async function copyTree(from: string, to: string): Promise<void> {
  await fs.mkdir(to, { recursive: true });
  for (const e of await fs.readdir(from, { withFileTypes: true })) {
    const src = path.join(from, e.name);
    const dst = path.join(to, e.name);
    if (e.isDirectory()) await copyTree(src, dst);
    else if (e.isFile()) await fs.copyFile(src, dst);
  }
}

/**
 * Installs the packages that ship with the app into `grantsDir`: a package is (re)installed when it
 * is missing or its installed version differs. Each install is staged next to its target and swapped
 * in by rename, so a crash never leaves a half-copied package. Applications keep their own copies,
 * so replacing an installed version never changes an application (§5.1).
 */
export async function installBundledPackages(
  bundledDir: string,
  grantsDir: string,
  onInvalid: (dir: string, err: Error) => void = () => {},
): Promise<string[]> {
  await fs.mkdir(grantsDir, { recursive: true });
  // Sweep staging folders a crash left behind.
  for (const e of await fs.readdir(grantsDir, { withFileTypes: true })) {
    // Best effort: a leftover that can't be removed now is hidden and harmless, and goes next start.
    if (e.isDirectory() && e.name.startsWith(".")) await removeTree(path.join(grantsDir, e.name)).catch(() => {});
  }
  const installed: string[] = [];
  for (const pkg of await listPackages(bundledDir, onInvalid)) {
    const target = path.join(grantsDir, pkg.manifest.id);
    const current = await checkPackage(target).catch(() => null);
    if (current?.version === pkg.manifest.version) continue;
    const staging = path.join(grantsDir, `.${pkg.manifest.id}.${randomBytes(4).toString("hex")}`);
    await copyTree(pkg.dir, staging);
    await makeReadOnly(staging);
    const old = path.join(grantsDir, `.${pkg.manifest.id}.old-${randomBytes(4).toString("hex")}`);
    if (await exists(target)) await fs.rename(target, old);
    await fs.rename(staging, target);
    await removeTree(old).catch(() => {});
    installed.push(pkg.manifest.id);
  }
  return installed;
}
