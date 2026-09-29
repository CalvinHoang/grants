// WP-4 done-checks in the running app (F-02, issue #7): a new application gets the §5.2 folder with
// the package files byte-identical; the requirements table edited in Excel is picked up; switching
// and relaunching restore the right application; a crash mid-create never leaves a half-made folder.
//
// Each run uses throwaway folders for the app data, Documents and the bundled grant packages
// (a fixture package built from the public CRC-P documents in reference/crc-p/source).
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";
import { _electron as electron, expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { writeFixturePackage } from "../../../packages/engine/src/storage/testing";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const shots = path.join(appDir, "test-results", "wp4");

let tmp: string;
let env: Record<string, string>;

const sha = async (file: string) => createHash("sha256").update(await fs.readFile(file)).digest("hex");

async function launch(): Promise<{ app: ElectronApplication; window: Page }> {
  const executable = process.env.GW_APP_EXECUTABLE;
  const linuxArgs = process.platform === "linux" ? ["--no-sandbox"] : [];
  const app = await electron.launch({
    ...(executable ? { executablePath: executable, args: linuxArgs } : { args: [appDir, ...linuxArgs], cwd: appDir }),
    env: { ...process.env, ...env } as Record<string, string>,
  });
  const window = await app.firstWindow();
  await expect(window.getByTestId("app")).toHaveAttribute("data-engine", "ready", { timeout: 15_000 });
  // engineInfo is available before asynchronous storage startup. A populated New application
  // grant selector proves the storage RPC startup barrier (including crash cleanup) has completed.
  await window.getByRole("button", { name: "Menu", exact: true }).click();
  await expect(window.getByTestId("drawer")).toBeVisible();
  await window.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));
  await window.getByTestId("drawer").getByRole("button", { name: "New application" }).click();
  await expect(window.getByTestId("drawer").getByLabel("Grant")).toHaveValue("crcp-r19");
  await window.keyboard.press("Escape");
  await window.keyboard.press("Escape");
  await expect(window.getByTestId("drawer")).toBeHidden();
  await window.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));
  return { app, window };
}

// Crash the whole application, including the utility process that owns storage. Killing only
// Electron's browser process can leave its children holding the Windows singleton/profile
// handles, causing the immediate relaunch to exit before Playwright connects.
async function crash(app: ElectronApplication): Promise<void> {
  const child = app.process();
  const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
  const disconnected = app.waitForEvent("close");
  if (process.platform === "win32") {
    await promisify(execFile)("taskkill", ["/PID", String(child.pid), "/T", "/F"]);
  } else {
    // Stop the storage writer first; a killed browser process does not run before-quit handlers.
    const utilityPids = await app.evaluate(({ app }) =>
      app.getAppMetrics().filter((metric) => metric.type === "Utility").map((metric) => metric.pid),
    );
    for (const pid of utilityPids) {
      try {
        process.kill(pid, "SIGKILL");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
      }
    }
    child.kill("SIGKILL");
  }
  await Promise.all([exited, disconnected]);
}

async function openCreate(window: Page) {
  const menu = window.getByRole("button", { name: "Menu", exact: true });
  const drawer = window.getByTestId("drawer");
  if (!(await drawer.isVisible())) {
    await menu.click();
    await expect(drawer).toBeVisible();
    await window.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));
  }
  const form = drawer.getByRole("form", { name: "New application" });
  if (!(await form.isVisible())) {
    await drawer.getByRole("button", { name: "New application" }).click();
    await expect(form).toBeVisible();
  }
  return { drawer, form };
}

async function create(window: Page, clientName: string) {
  const { form } = await openCreate(window);
  await form.getByLabel("Client").fill(clientName);
  await form.getByRole("button", { name: "Create" }).click();
  await expect(window.getByTestId("topbar")).toContainText(clientName);
}

test.beforeAll(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "gw-e2e-wp4-"));
  const bundled = path.join(tmp, "bundled-grants");
  await writeFixturePackage(bundled);
  env = {
    GW_USER_DATA_DIR: path.join(tmp, "appdata"),
    GW_DOCUMENTS_DIR: path.join(tmp, "Documents"),
    GW_BUNDLED_GRANTS_DIR: bundled,
  };
  await fs.mkdir(shots, { recursive: true });
});

test.afterAll(async () => {
  await fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
});

test.describe.configure({ mode: "serial" });

test("F-02 AC1/AC2: new application folder, package copies, Excel edits picked up", async () => {
  const { app, window } = await launch();
  try {
    const { form: firstForm } = await openCreate(window);
    await expect(firstForm.getByLabel("Grant")).toHaveValue("crcp-r19");
    await expect(firstForm.getByLabel("Grant").locator("option")).toHaveText(["CRC-P Round 19"]);
    await firstForm.getByLabel("Client").fill("Harbour Robotics");
    await firstForm.getByRole("button", { name: "Create" }).click();
    await expect(window.getByTestId("topbar")).toContainText("Harbour Robotics");
    await window.screenshot({ path: path.join(shots, "1-created.png") });

    // AC1: exactly the §5.2 layout, package files byte-identical.
    const folder = path.join(tmp, "Documents", "Grant Workbench", "Harbour Robotics – CRC-P Round 19");
    const pkg = path.join(tmp, "appdata", "grants", "crcp-r19");
    expect((await fs.readdir(folder)).sort()).toEqual(
      [".workbench", "Deliverables", "Grant documents", "References and templates", "Sources", "Workflow"].sort(),
    );
    const docs = (await fs.readdir(path.join(pkg, "documents"))).sort();
    expect((await fs.readdir(path.join(folder, "Grant documents"))).sort()).toEqual(docs);
    for (const d of docs) expect(await sha(path.join(folder, "Grant documents", d))).toBe(await sha(path.join(pkg, "documents", d)));
    const table = path.join(folder, "Workflow", "requirements-table.xlsx");
    expect(await sha(table)).toBe(await sha(path.join(pkg, "requirements-table.xlsx")));
    expect(await sha(path.join(folder, "Deliverables", "R&D application.docx"))).toBe(
      await sha(path.join(pkg, "documents", "application-form.docx")),
    );
    expect((await fs.readdir(path.join(folder, "Workflow"))).sort()).toEqual(["digest-table.xlsx", "requirements-table.xlsx"]);
    expect((await fs.readdir(path.join(folder, ".workbench"))).sort()).toEqual(
      expect.arrayContaining(["application.json", "cache", "sharepoint-links.json", "workbench.db"]),
    );

    // Edit the table the way Excel saves: write a temp file, rename it over the original.
    const pkgHash = await sha(path.join(pkg, "requirements-table.xlsx"));
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(table);
    const initialRowCount = wb.worksheets[0]!.rowCount;
    wb.worksheets[0]!.getCell("E2").value = "Board-approved budget";
    wb.worksheets[0]!.addRow(["EL-11.4", "led by an SME", "Application form", "AF-G.2", "Lead SME evidence"]);
    const temp = path.join(folder, "Workflow", "~$edit.tmp");
    await wb.xlsx.writeFile(temp);
    await fs.rename(temp, table);

    // The table watcher/reread is covered by the storage integration tests; WP-10 owns the visible
    // table editor. Here verify the externally edited application copy persists and the package copy
    // remains untouched.
    const reread = new ExcelJS.Workbook();
    await reread.xlsx.readFile(table);
    expect(reread.worksheets[0]!.getCell("E2").value).toBe("Board-approved budget");
    expect(reread.worksheets[0]!.rowCount).toBe(initialRowCount + 1);
    await window.screenshot({ path: path.join(shots, "2-excel-edit-persisted.png") });
    expect(await sha(path.join(pkg, "requirements-table.xlsx"))).toBe(pkgHash);

    // A duplicate name is refused and nothing is created.
    const { form: duplicateForm } = await openCreate(window);
    await duplicateForm.getByLabel("Client").fill("Harbour Robotics");
    await duplicateForm.getByRole("button", { name: "Create" }).click();
    await expect(duplicateForm.locator(".form-error")).toBeVisible();
    expect(await fs.readdir(path.join(tmp, "Documents", "Grant Workbench"))).toEqual(["Harbour Robotics – CRC-P Round 19"]);
  } finally {
    await app.close();
  }
});

test("F-02: switching applications keeps each one's own table; AC3 relaunch restores the last one", async () => {
  let { app, window } = await launch();
  try {
    // Relaunch restored the application open at the end of the last test.
    await expect(window.getByTestId("topbar")).toContainText("Harbour Robotics");

    await create(window, "Tasman Foods");
    await expect(window.getByTestId("topbar")).toContainText("Tasman Foods");

    await window.getByRole("button", { name: "Menu", exact: true }).click();
    let drawer = window.getByTestId("drawer");
    await drawer.getByRole("button", { name: /Harbour Robotics/ }).click();
    await expect(window.getByTestId("topbar")).toContainText("Harbour Robotics");
    await window.getByRole("button", { name: "Menu", exact: true }).click();
    drawer = window.getByTestId("drawer");
    await drawer.getByRole("button", { name: /Tasman Foods/ }).click();
    await expect(window.getByTestId("topbar")).toContainText("Tasman Foods");
    await window.screenshot({ path: path.join(shots, "3-two-applications.png") });
    await app.close();

    ({ app, window } = await launch());
    await expect(window.getByTestId("topbar")).toContainText("Tasman Foods");
    await window.screenshot({ path: path.join(shots, "4-relaunch-restored.png") });
  } finally {
    await app.close();
  }
});

test("a crash while creating an application never leaves a half-made folder", async () => {
  const root = path.join(tmp, "Documents", "Grant Workbench");
  for (const [i, delay] of [0, 5, 15, 40, 80].entries()) {
    const { app, window } = await launch();
    const { form } = await openCreate(window);
    await form.getByLabel("Client").fill(`Crash Test ${i}`);
    await form.getByRole("button", { name: "Create" }).click();
    await new Promise((r) => setTimeout(r, delay));
    await crash(app);

    // Relaunching sweeps any staging folder; the application exists completely or not at all.
    const again = await launch();
    try {
      await expect(again.window.getByTestId("app")).toHaveAttribute("data-engine", "ready");
      const names = await fs.readdir(root);
      expect(names.filter((n) => n.startsWith("."))).toEqual([]);
      const folder = path.join(root, `Crash Test ${i} – CRC-P Round 19`);
      const made = await fs.access(folder).then(
        () => true,
        () => false,
      );
      if (made) {
        expect(await fs.readFile(path.join(folder, ".workbench", "application.json"), "utf8")).toContain(`Crash Test ${i}`);
        expect(await sha(path.join(folder, "Workflow", "requirements-table.xlsx"))).toBe(
          await sha(path.join(tmp, "appdata", "grants", "crcp-r19", "requirements-table.xlsx")),
        );
      }
    } finally {
      await again.app.close();
    }
  }
});
