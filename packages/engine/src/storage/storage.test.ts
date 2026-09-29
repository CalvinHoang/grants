import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import ExcelJS from "exceljs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DigestTableRow, EventName, EventPayload, RequirementRow } from "@gw/shared";
import { FILES, LAYOUT } from "./applications";
import { DatabaseTooNewError, LATEST_SCHEMA_VERSION, migrate, openDatabase } from "./db";
import { installBundledPackages, listPackages, loadPackage } from "./grants";
import { storagePaths, type StoragePaths } from "./paths";
import { OpenApplication, Storage } from "./storage";
import { FIXTURE_ROWS, writeFixturePackage } from "./testing";
import { readDigestTable, readRequirementsTable, REQUIREMENTS_HEADERS, writeDigestTable, writeRequirementsTable } from "./tables";

let tmp: string;
let paths: StoragePaths;
let events: { event: EventName; payload: unknown }[];
let storage: Storage;

const hashFile = async (file: string) => createHash("sha256").update(await fs.readFile(file)).digest("hex");

async function listTree(dir: string, base = dir): Promise<string[]> {
  const out: string[] = [];
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    const rel = path.relative(base, p).split(path.sep).join("/");
    if (e.isDirectory()) out.push(rel + "/", ...(await listTree(p, base)));
    else out.push(rel);
  }
  return out.sort();
}

function newStorage(): Storage {
  return new Storage(
    paths,
    <E extends EventName>(event: E, payload: EventPayload<E>) => events.push({ event, payload }),
    { watch: { debounceMs: 20, pollMs: 100 } },
  );
}

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "gw-storage-"));
  const bundled = path.join(tmp, "bundled");
  await writeFixturePackage(bundled);
  paths = storagePaths({ appDataDir: path.join(tmp, "appdata"), documentsDir: path.join(tmp, "Documents"), bundledGrantsDir: bundled });
  events = [];
  storage = newStorage();
  await storage.init();
});

afterEach(async () => {
  storage.close();
  // Installed packages are read-only; make them deletable.
  await fs.chmod(tmp, 0o755);
  await fs.rm(tmp, { recursive: true, force: true }).catch(async () => {
    const { execFileSync } = await import("node:child_process");
    execFileSync("chmod", ["-R", "u+w", tmp]);
    await fs.rm(tmp, { recursive: true, force: true });
  });
});

describe("grant packages (§5.1)", () => {
  it("installs bundled packages read-only and lists them", async () => {
    const grants = await storage.listGrants();
    expect(grants.map((g) => g.name)).toEqual(["CRC-P Round 19"]);
    const stat = await fs.stat(path.join(paths.grantsDir, "crcp-r19", "requirements-table.xlsx"));
    expect(stat.mode & 0o222).toBe(0);
    const pkg = await loadPackage(path.join(paths.grantsDir, "crcp-r19"));
    expect(pkg.requirements).toEqual(FIXTURE_ROWS);
    expect(pkg.formMap.fields[0]?.id).toBe("AF-I.4");
    expect(pkg.documents).toContain("application-form.docx");
  });

  it("reinstalls only when the shipped version changes", async () => {
    const bundled = paths.bundledGrantsDir!;
    expect(await installBundledPackages(bundled, paths.grantsDir)).toEqual([]);
    await fs.rm(path.join(bundled, "crcp-r19"), { recursive: true });
    await writeFixturePackage(bundled, { version: "1.0.1" });
    expect(await installBundledPackages(bundled, paths.grantsDir)).toEqual(["crcp-r19"]);
    expect((await storage.listGrants())[0]?.version).toBe("1.0.1");
    // No staging or old copies left behind.
    expect(await fs.readdir(paths.grantsDir)).toEqual(["crcp-r19"]);
  });

  it("skips an incomplete package and reports it", async () => {
    const broken = path.join(paths.grantsDir, "broken");
    await fs.mkdir(broken);
    await fs.writeFile(path.join(broken, "manifest.json"), "{}");
    const invalid: string[] = [];
    const found = await listPackages(paths.grantsDir, (dir) => invalid.push(path.basename(dir)));
    expect(found.map((p) => p.manifest.id)).toEqual(["crcp-r19"]);
    expect(invalid).toEqual(["broken"]);
  });
});

describe("new application (F-02)", () => {
  it("AC1: creates exactly the §5.2 layout with package files byte-identical", async () => {
    const app = await storage.createApplication("crcp-r19", "Harbour Robotics");
    expect(app.name).toBe("Harbour Robotics – CRC-P Round 19");
    expect(app.folder).toBe(path.join(paths.applicationsRoot, "Harbour Robotics – CRC-P Round 19"));
    expect(paths.applicationsRoot).toBe(path.join(tmp, "Documents", "Grant Workbench"));

    const pkgDir = path.join(paths.grantsDir, "crcp-r19");
    const docs = (await fs.readdir(path.join(pkgDir, "documents"))).sort();
    expect(await listTree(app.folder)).toEqual(
      [
        "Deliverables/",
        "Deliverables/R&D application.docx",
        "Grant documents/",
        ...docs.map((d) => `Grant documents/${d}`),
        "References and templates/",
        "Sources/",
        "Workflow/",
        "Workflow/digest-table.xlsx",
        "Workflow/requirements-table.xlsx",
        ".workbench/",
        ".workbench/application.json",
        ".workbench/cache/",
        ".workbench/grant/",
        ".workbench/grant/form-map.json",
        ".workbench/grant/manifest.json",
        ".workbench/grant/questions.json",
        ".workbench/grant/rules.json",
        ".workbench/sharepoint-links.json",
        ".workbench/workbench.db",
      ].sort(),
    );
    for (const d of docs) {
      expect(await hashFile(path.join(app.folder, LAYOUT.grantDocuments, d))).toBe(await hashFile(path.join(pkgDir, "documents", d)));
    }
    expect(await hashFile(path.join(app.folder, FILES.requirements))).toBe(await hashFile(path.join(pkgDir, "requirements-table.xlsx")));
    expect(await hashFile(path.join(app.folder, FILES.form))).toBe(await hashFile(path.join(pkgDir, "documents", "application-form.docx")));
    expect(await readDigestTable(path.join(app.folder, FILES.digest))).toEqual([]);
    for (const f of ["manifest.json", "form-map.json", "questions.json", "rules.json"]) {
      expect(await hashFile(path.join(app.folder, FILES.grant, f))).toBe(await hashFile(path.join(pkgDir, f)));
    }
    expect((await (await storage.openApplication(app.id)).getFormMap()).fields.map((f) => f.id)).toEqual(["AF-I.4"]);

    const record = JSON.parse(await fs.readFile(path.join(app.folder, FILES.record), "utf8"));
    expect(record).toMatchObject({ packageId: "crcp-r19", packageVersion: "1.0.0", clientName: "Harbour Robotics" });
    expect(await storage.listApplications()).toEqual([app]);
  });

  it("copies are writable even though the package is read-only", async () => {
    const app = await storage.createApplication("crcp-r19", "Harbour Robotics");
    const st = await fs.stat(path.join(app.folder, FILES.requirements));
    expect(st.mode & 0o200).toBe(0o200);
  });

  it("refuses a duplicate or unusable name and leaves nothing behind", async () => {
    await storage.createApplication("crcp-r19", "Harbour Robotics");
    await expect(storage.createApplication("crcp-r19", "  Harbour   Robotics ")).rejects.toThrow(/already exists/);
    await expect(storage.createApplication("crcp-r19", "A/B")).rejects.toThrow(/can't contain/);
    await expect(storage.createApplication("crcp-r19", "con")).rejects.toThrow(/reserved/);
    await expect(storage.createApplication("nope", "X")).rejects.toThrow(/not installed/);
    expect(await fs.readdir(paths.applicationsRoot)).toEqual(["Harbour Robotics – CRC-P Round 19"]);
  });

  it("accepts a trailing dot and caps the length of the client name", async () => {
    const app = await storage.createApplication("crcp-r19", "Harbour Robotics Pty. Ltd.");
    expect(app.name).toBe("Harbour Robotics Pty. Ltd. – CRC-P Round 19");
    await expect(storage.createApplication("crcp-r19", "x".repeat(61))).rejects.toThrow(/under 60/);
  });

  it("gives a folder copied in Explorer its own id", async () => {
    const app = await storage.createApplication("crcp-r19", "Harbour Robotics");
    const copy = path.join(paths.applicationsRoot, "Harbour Robotics – CRC-P Round 19 - Copy");
    await fs.cp(app.folder, copy, { recursive: true });
    const list = await storage.listApplications();
    expect(list.map((a) => a.name)).toEqual(["Harbour Robotics – CRC-P Round 19", "Harbour Robotics – CRC-P Round 19 - Copy"]);
    expect(list[0]?.id).toBe(app.id);
    expect(list[1]?.id).not.toBe(app.id);
    // The new id is stored, so it stays the same from one listing to the next.
    expect((await storage.listApplications())[1]?.id).toBe(list[1]?.id);
    expect((await storage.openApplication(list[1]!.id)).summary.folder).toBe(copy);
  });

  it("removes a half-made application left by a crash", async () => {
    await fs.mkdir(path.join(paths.applicationsRoot, ".creating-abc", "Workflow"), { recursive: true });
    await newStorage().init();
    expect(await fs.readdir(paths.applicationsRoot)).toEqual([]);
  });

  it("AC2: editing the application's requirements table never changes the package copy", async () => {
    const app = await storage.createApplication("crcp-r19", "Harbour Robotics");
    const pkgTable = path.join(paths.grantsDir, "crcp-r19", "requirements-table.xlsx");
    const before = await hashFile(pkgTable);
    const open = await storage.openApplication(app.id);
    const edited: RequirementRow[] = [
      { ...FIXTURE_ROWS[0]!, itemsFromClient: "Board-approved budget" },
      FIXTURE_ROWS[2]!,
      { id: "MC-1a.1", wording: "added row", deliverable: "Application form", formField: "AF-I.1", itemsFromClient: "" },
    ];
    await open.saveRequirements(edited);
    expect(await open.getRequirements()).toEqual(edited);
    expect(await readRequirementsTable(path.join(app.folder, FILES.requirements))).toEqual(edited);
    expect(await hashFile(pkgTable)).toBe(before);
    // The engine's own write is not reported back as an outside change.
    await new Promise((r) => setTimeout(r, 300));
    expect(events.filter((e) => e.event === "table.changed")).toEqual([]);
  });

  it("merges concurrent UI state patches and restores both after restart", async () => {
    await Promise.all([
      storage.setUiState({ leftWidth: 280, leftOpen: true }),
      storage.setUiState({ rightWidth: 360, rightOpen: false }),
    ]);
    storage.close();
    storage = newStorage();
    await storage.init();
    expect(await storage.getUiState()).toMatchObject({ leftWidth: 280, leftOpen: true, rightWidth: 360, rightOpen: false });
  });

  it("shares one open operation between concurrent requests", async () => {
    const app = await storage.createApplication("crcp-r19", "Harbour Robotics");
    const open = vi.spyOn(OpenApplication, "open");
    try {
      const [first, second] = await Promise.all([
        storage.openApplication(app.id),
        storage.openApplication(app.id),
      ]);
      expect(open).toHaveBeenCalledTimes(1);
      expect(first).toBe(second);
      // The shared handle remains usable after both callers resolve.
      await first.saveRequirements(FIXTURE_ROWS);
      expect(await second.getRequirements()).toEqual(FIXTURE_ROWS);
    } finally {
      open.mockRestore();
    }
  });

  it("AC3: remembers the last open application and window state across restarts", async () => {
    const a = await storage.createApplication("crcp-r19", "Harbour Robotics");
    const b = await storage.createApplication("crcp-r19", "Tasman Foods");
    await storage.openAndRemember(a.id);
    await storage.setUiState({ leftWidth: 300, leftOpen: true, sections: { sources: true, grant: false } });
    await storage.openAndRemember(b.id);
    storage.close();
    storage = newStorage();
    await storage.init();
    expect(await storage.getUiState()).toEqual({
      lastApplicationId: b.id,
      leftWidth: 300,
      rightWidth: null,
      leftOpen: true,
      rightOpen: null,
      sections: { sources: true, grant: false },
    });
  });
});

describe("tables (.xlsx)", () => {
  it("picks up an edit made in Excel", async () => {
    const app = await storage.createApplication("crcp-r19", "Harbour Robotics");
    const open = await storage.openApplication(app.id);
    expect(await open.getRequirements()).toEqual(FIXTURE_ROWS);

    // Edit the way Excel does: load, change a cell (rich text), save to a temp file, rename over.
    const file = path.join(app.folder, FILES.requirements);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(file);
    const ws = wb.worksheets[0]!;
    ws.getCell("E2").value = { richText: [{ text: "Budget; " }, { text: "board papers", font: { bold: true } }] };
    ws.addRow(["EL-11.4", "led by an SME", "Application form", "AF-G.2", 42]);
    const temp = path.join(app.folder, LAYOUT.workflow, "~$tmp.xlsx");
    await wb.xlsx.writeFile(temp);
    await fs.rename(temp, file);

    await expect.poll(() => events.filter((e) => e.event === "table.changed").length, { timeout: 3000 }).toBe(1);
    expect(events.find((e) => e.event === "table.changed")?.payload).toEqual({ applicationId: app.id, table: "requirements" });
    const rows = await open.getRequirements();
    expect(rows[0]?.itemsFromClient).toBe("Budget; board papers");
    expect(rows.at(-1)).toEqual({ id: "EL-11.4", wording: "led by an SME", deliverable: "Application form", formField: "AF-G.2", itemsFromClient: "42" });
  });

  it("keeps the last good rows and reports a broken table", async () => {
    const app = await storage.createApplication("crcp-r19", "Harbour Robotics");
    const open = await storage.openApplication(app.id);
    const file = path.join(app.folder, FILES.requirements);
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("x");
    ws.addRow(["Wrong", ...REQUIREMENTS_HEADERS.slice(1)]);
    await fs.writeFile(file, new Uint8Array(await wb.xlsx.writeBuffer()));
    await expect(open.getRequirements()).rejects.toThrow(/Column 1 must be headed "ID"/);
    expect(events.some((e) => e.event === "error")).toBe(true);
  });

  it("keeps verbatim text exactly, including control characters and _xHHHH_ sequences", async () => {
    const file = path.join(tmp, "verbatim.xlsx");
    const tricky = "page\fbreak\vtab\u0001 _x0041_ x_x005F_y a_b_ \u201cquotes\u201d\r\nnew line";
    const rows: RequirementRow[] = [{ ...FIXTURE_ROWS[0]!, wording: tricky }];
    await writeRequirementsTable(file, rows);
    expect((await readRequirementsTable(file))[0]?.wording).toBe(tricky);
    const digest: DigestTableRow[] = [
      { passageId: "P-001", sourceDocument: "a.pdf", location: "p. 1", party: "", passage: tricky, rowIds: [], pSupports: [], statuses: [], usedIn: "" },
    ];
    await writeDigestTable(file, digest);
    expect((await readDigestTable(file))[0]?.passage).toBe(tricky);
  });

  it("an app save keeps what the advisor added in Excel", async () => {
    const file = path.join(tmp, "styled.xlsx");
    await writeRequirementsTable(file, FIXTURE_ROWS);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(file);
    wb.worksheets[0]!.getColumn(2).width = 99;
    wb.worksheets[0]!.getCell("A1").note = "advisor note";
    wb.addWorksheet("My notes").getCell("A1").value = "keep me";
    await wb.xlsx.writeFile(file);

    await writeRequirementsTable(file, [FIXTURE_ROWS[1]!]);
    const after = new ExcelJS.Workbook();
    await after.xlsx.readFile(file);
    expect(after.worksheets.map((w) => w.name)).toEqual(["Requirements", "My notes"]);
    expect(after.worksheets[0]!.getColumn(2).width).toBe(99);
    expect(after.worksheets[0]!.getCell("A1").note).toBe("advisor note");
    expect(after.worksheets[1]!.getCell("A1").value).toBe("keep me");
    expect(await readRequirementsTable(file)).toEqual([FIXTURE_ROWS[1]]);
  });

  it("round-trips the digest table, one row per passage with per-link lists", async () => {
    const file = path.join(tmp, "digest.xlsx");
    const rows: DigestTableRow[] = [
      {
        passageId: "P-001",
        sourceDocument: "Board minutes.pdf (minutes)",
        location: "p. 3 ¶ 2",
        party: "Lead applicant",
        passage: "Line one.\nLine two.",
        rowIds: ["MC-4a.2", "MC-4d.3"],
        pSupports: [0.995, null],
        statuses: ["confirmed", "advisor-added"],
        usedIn: "AF-I.4 s2",
      },
    ];
    await writeDigestTable(file, rows);
    expect(await readDigestTable(file)).toEqual(rows);
  });

  it("reads statuses and probabilities the way an advisor types them", async () => {
    const file = path.join(tmp, "digest.xlsx");
    await writeDigestTable(file, []);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(file);
    wb.worksheets[0]!.addRow(["P-002", "Note", "", "", "Text", "MC-4a.2; EL-11.3", "85%", "Rejected by advisor", ""]);
    await wb.xlsx.writeFile(file);
    const [row] = await readDigestTable(file);
    expect(row?.pSupports).toEqual([0.85, null]);
    expect(row?.statuses).toEqual(["rejected", "advisor-added"]);
  });
});

describe("database (§5.3)", () => {
  it("is created in WAL mode at the latest schema version with every table", async () => {
    const app = await storage.createApplication("crcp-r19", "Harbour Robotics");
    const db = (await storage.openApplication(app.id)).db;
    expect((db.prepare("PRAGMA journal_mode").get() as { journal_mode: string }).journal_mode).toBe("wal");
    expect((db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version).toBe(LATEST_SCHEMA_VERSION);
    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as { name: string }[]).map((r) => r.name);
    expect(tables).toEqual(
      ["calls", "chat", "documents", "fields", "flags", "meta", "paragraphs", "passage_links", "passages", "runs", "scores", "sentences"].sort(),
    );
    expect(db.prepare("SELECT value FROM meta WHERE key = 'application_id'").get()).toEqual({ value: app.id });
  });

  it("enforces the verbatim rule: a digest passage is a paragraph span, never its own text", async () => {
    const db = openDatabase(path.join(tmp, "v.db"));
    db.prepare("INSERT INTO documents VALUES ('D001','a.pdf','Sources/a.pdf','local','pdf',?,NULL,NULL,1,'indexed','2026-09-27T00:00:00Z')").run("0".repeat(64));
    expect(() =>
      db.prepare("INSERT INTO passages (id, origin, document_id, first_ordinal, last_ordinal, note_text, created_at) VALUES ('P-001','digest','D001',1,2,'model text','x')").run(),
    ).toThrow(/CHECK/);
    db.prepare("INSERT INTO passages (id, origin, document_id, first_ordinal, last_ordinal, created_at) VALUES ('P-001','digest','D001',1,2,'x')").run();
    db.prepare("INSERT INTO passages (id, origin, note_text, note_author, created_at) VALUES ('P-002','advisor-note','Said in chat','Calvin','x')").run();
    db.close();
  });

  it("migrates once, and refuses a database from a newer app", async () => {
    const db = openDatabase(path.join(tmp, "m.db"));
    expect(migrate(db)).toBe(LATEST_SCHEMA_VERSION);
    db.exec(`PRAGMA user_version = ${LATEST_SCHEMA_VERSION + 1}`);
    expect(() => migrate(db)).toThrow(DatabaseTooNewError);
    db.close();
  });

  it("rolls back a migration that fails part-way", async () => {
    const db = openDatabase(path.join(tmp, "r.db"));
    const broken = [{ version: LATEST_SCHEMA_VERSION + 1, name: "bad", sql: "CREATE TABLE extra (x); CREATE TABLE extra (x);" }];
    expect(() => migrate(db, broken)).toThrow();
    expect(db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name = 'extra'").get()).toEqual({ n: 0 });
    expect((db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version).toBe(LATEST_SCHEMA_VERSION);
    db.close();
  });
});

it("writeRequirementsTable output reads back identically, including verbatim whitespace", async () => {
  const file = path.join(tmp, "req.xlsx");
  const rows: RequirementRow[] = [{ id: "MC-1a.1", wording: "  “quoted” wording\nover two lines ", deliverable: "", formField: "", itemsFromClient: "" }];
  await writeRequirementsTable(file, rows);
  expect(await readRequirementsTable(file)).toEqual(rows);
});
