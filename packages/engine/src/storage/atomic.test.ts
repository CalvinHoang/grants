// §10.4 / issue #7 done-check: "a killed write never leaves a corrupt file". A child process
// rewrites the requirements table in a loop, alternating between two versions, and is killed with
// SIGKILL at random moments. After every kill the table must read back as one version or the other.
import { fork } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { removeStaleTempFiles, writeFileAtomic } from "./atomic";
import { readRequirementsTable, writeRequirementsTable } from "./tables";

const here = path.dirname(fileURLToPath(import.meta.url));
let tmp: string;
let childScript: string;

// Large enough that one write takes a noticeable time, so kills land mid-write.
const SMALL = 200;
const LARGE = 4000;

const CHILD_SOURCE = `
import { writeFileSync } from "node:fs";
import { writeRequirementsTable } from ${JSON.stringify(path.join(here, "tables.ts"))};
import { writeFileAtomic } from ${JSON.stringify(path.join(here, "atomic.ts"))};
const [file, mode] = process.argv.slice(2);
if (mode === "bytes" || mode === "naive") {
  // Two 24 MB versions: long enough on disk that kills land during the file write itself.
  const versions = [new Uint8Array(24 << 20).fill(97), new Uint8Array(24 << 20).fill(98)];
  for (let i = 0; ; i++) {
    if (mode === "bytes") await writeFileAtomic(file, versions[i % 2]);
    else writeFileSync(file, versions[i % 2]);
    process.send?.("wrote");
  }
}
const rows = (n) => Array.from({ length: n }, (_, i) => ({
  id: "MC-" + (i + 1) + ".1",
  wording: "guideline wording ".repeat(8) + i,
  deliverable: "Application form",
  formField: "AF-I.4",
  itemsFromClient: "items ".repeat(6),
}));
const versions = [rows(${SMALL}), rows(${LARGE})];
for (let i = 0; ; i++) {
  await writeRequirementsTable(file, versions[i % 2]);
  process.send?.("wrote");
}
`;

beforeAll(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "gw-kill-"));
  const entry = path.join(tmp, "child-entry.mjs");
  await fs.writeFile(entry, CHILD_SOURCE);
  childScript = path.join(tmp, "child.mjs");
  await build({
    entryPoints: [entry],
    outfile: childScript,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    logLevel: "silent",
    // exceljs is CommonJS; esbuild's ESM output needs a require for Node built-ins it uses.
    banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  });
}, 60_000);

afterAll(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe("atomic writes", () => {
  it("a write killed at any moment leaves the old table or the new one, never a corrupt file", async () => {
    const dir = path.join(tmp, "Workflow");
    await fs.mkdir(dir);
    const file = path.join(dir, "requirements-table.xlsx");
    const kills = 18;
    const sizes = [SMALL, LARGE];
    for (let k = 0; k < kills; k++) {
      const child = fork(childScript, [file, "xlsx"], { stdio: ["ignore", "ignore", "inherit", "ipc"] });
      // Let 1–3 writes complete (so either version can be on disk), then kill at a random moment,
      // usually in the middle of the next write.
      const completed = 1 + (k % 3);
      await new Promise<void>((resolve) => {
        let n = 0;
        child.on("message", () => ++n === completed && resolve());
      });
      await new Promise((r) => setTimeout(r, Math.random() * 60));
      child.kill("SIGKILL");
      await new Promise((r) => child.once("exit", r));

      const exists = await fs.access(file).then(
        () => true,
        () => false,
      );
      expect(exists).toBe(true);
      const rows = await readRequirementsTable(file);
      // A whole table, exactly one of the two versions (which one depends on where the kill landed).
      expect(sizes).toContain(rows.length);
      await removeStaleTempFiles(dir);
    }
    expect((await fs.readdir(dir)).filter((n) => n !== "requirements-table.xlsx")).toEqual([]);
  }, 120_000);

  /** Kills a child writing two large byte versions; returns what was on disk after each kill. */
  async function killWhileWriting(mode: "bytes" | "naive", kills: number) {
    const dir = await fs.mkdtemp(path.join(tmp, mode + "-"));
    const file = path.join(dir, "table.xlsx");
    const outcomes: string[] = [];
    let leftovers = 0;
    for (let k = 0; k < kills; k++) {
      const child = fork(childScript, [file, mode], { stdio: ["ignore", "ignore", "inherit", "ipc"] });
      const completed = 1 + (k % 2);
      await new Promise<void>((resolve) => {
        let n = 0;
        child.on("message", () => ++n === completed && resolve());
      });
      await new Promise((r) => setTimeout(r, Math.random() * 40));
      child.kill("SIGKILL");
      await new Promise((r) => child.once("exit", r));
      const data = await fs.readFile(file);
      const whole = data.length === 24 << 20 && (data.every((b) => b === 97) || data.every((b) => b === 98));
      outcomes.push(whole ? String.fromCharCode(data[0]!) : "corrupt");
      leftovers += await removeStaleTempFiles(dir);
    }
    return { outcomes, leftovers };
  }

  it("the same holds when the kill lands during the disk write itself", async () => {
    const { outcomes, leftovers } = await killWhileWriting("bytes", 12);
    expect(outcomes).not.toContain("corrupt");
    // Some kills interrupted a write in progress (they left a temp file, which is swept on open).
    expect(leftovers).toBeGreaterThan(0);
  }, 120_000);

  it("control: a plain overwrite killed mid-write does corrupt the file (the test can catch it)", async () => {
    const { outcomes } = await killWhileWriting("naive", 12);
    expect(outcomes).toContain("corrupt");
  }, 120_000);

  it("replaces the target in one step and cleans up its temp file", async () => {
    const file = path.join(tmp, "x.json");
    await writeFileAtomic(file, "one");
    await writeFileAtomic(file, "two");
    expect(await fs.readFile(file, "utf8")).toBe("two");
    expect(await fs.readdir(tmp)).not.toContain(expect.stringMatching(/gw-tmp$/));
  });

  it("writeRequirementsTable writes through the atomic path", async () => {
    const file = path.join(tmp, "t.xlsx");
    await writeRequirementsTable(file, []);
    expect(await readRequirementsTable(file)).toEqual([]);
  });
});
