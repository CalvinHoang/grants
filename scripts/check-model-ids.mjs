#!/usr/bin/env node
// CI check (build spec §9.2, F-16 AC4): no model ID may appear outside a models.json file.
// Code and prompts name model roles only. Specs, research notes and the grant reference pack
// (docs/, reference/, design/) are prose, not source, and are skipped.
//
// Two checks: known model-ID families by pattern, and every exact model ID listed in the shipped
// models.json file(s).
//
// Usage: node scripts/check-model-ids.mjs        scans the files git tracks (plus new, unignored files)
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Families of provider model IDs. Extend when a new provider is added. */
export const MODEL_ID_PATTERNS = [
  /\bclaude-(?:opus|sonnet|haiku|fable|instant|mythos|\d)[\w.-]*/i,
  /\b(?:us|eu|apac|global)\.anthropic\.[\w.-]+/i,
  /\b(?:chat)?gpt-(?:\d|oss|image|realtime|audio)[\w.-]*/i,
  /\bo[1-9]-(?:mini|pro|preview|deep-research|\d{4}-\d\d-\d\d)\b/i,
  /["'`]o[1-9]["'`]/,
  /\bgemini-\d[\w.-]*/i,
  /\bjev-(?:\d|latest)[\w.-]*/i,
  /\btext-embedding-[\w.-]+/i,
  /\b(?:llama|mistral|mixtral|codestral)-\d[\w.-]*/i,
  /\b(?:grok|deepseek|qwen\d*(?:\.\d+)?|phi)-\d?[\w.-]*\d[\w.-]*/i,
  /\bcommand-r[\w.-]*/i,
];

/**
 * The only places a models.json may live (§9.2). WP-6 adds the shipped file here; keep the list
 * short so a models.json dropped next to source or prompts is still checked.
 */
export const ALLOWED_MODELS_JSON = ["config/models.json", "apps/desktop/resources/models.json"];

const SKIP_DIRS = ["docs/", "reference/", "design/"];
// Lockfiles list third-party package names, which can look like model IDs.
const SKIP_FILES = new Set(["package-lock.json"]);
const BINARY_EXT = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".ico", ".icns", ".pdf", ".docx", ".xlsx", ".zip", ".woff", ".woff2", ".ttf",
]);

/** True for files the check applies to. `file` is repo-relative with forward slashes. */
export function inScope(file) {
  if (SKIP_DIRS.some((d) => file.startsWith(d))) return false;
  if (ALLOWED_MODELS_JSON.includes(file)) return false;
  if (SKIP_FILES.has(path.posix.basename(file))) return false;
  if (BINARY_EXT.has(path.posix.extname(file).toLowerCase())) return false;
  return true;
}

/** Model IDs listed in the allowed models.json files that exist under root. */
export function configuredModelIds(root) {
  const ids = new Set();
  for (const file of ALLOWED_MODELS_JSON) {
    let cfg;
    try {
      cfg = JSON.parse(readFileSync(path.join(root, file), "utf8"));
    } catch {
      continue;
    }
    for (const role of Object.values(cfg.roles ?? {})) {
      if (typeof role?.model === "string") ids.add(role.model);
      for (const choice of role?.choices ?? []) if (typeof choice === "string") ids.add(choice);
    }
    for (const id of Object.keys(cfg.prices ?? {})) ids.add(id);
  }
  return [...ids].filter((id) => id.length >= 3);
}

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Returns one finding per offending line: { file, line, match }. */
export function findModelIds(root, files) {
  const findings = [];
  const patterns = [
    ...MODEL_ID_PATTERNS,
    ...configuredModelIds(root).map((id) => new RegExp(`(?<![\\w.-])${escape(id)}(?![\\w-])`)),
  ];
  for (const file of files) {
    if (!inScope(file)) continue;
    let text;
    try {
      text = readFileSync(path.join(root, file), "utf8");
    } catch {
      continue; // deleted in the working tree
    }
    if (text.includes("\u0000")) continue;
    text.split(/\r?\n/).forEach((lineText, i) => {
      for (const pattern of patterns) {
        const m = lineText.match(pattern);
        if (m) {
          findings.push({ file, line: i + 1, match: m[0] });
          break;
        }
      }
    });
  }
  return findings;
}

function gitFiles(root) {
  const out = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
    cwd: root,
    encoding: "utf8",
  });
  return out.split("\0").filter(Boolean);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const findings = findModelIds(root, gitFiles(root));
  if (findings.length > 0) {
    for (const f of findings) {
      console.error(`${f.file}:${f.line}: model ID "${f.match}" outside models.json; refer to a model role instead`);
    }
    console.error(`\n${findings.length} model ID(s) found outside models.json (build spec §9.2).`);
    process.exit(1);
  }
  console.log("No model IDs outside models.json.");
}
