// WP-2 done-checks in the running Electron app: grant documents open in their native viewer
// surfaces for PDF, DOCX, XLSX, Markdown and text.
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron, expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { writeFixturePackage } from "../../../packages/engine/src/storage/testing";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function launch(tmp: string): Promise<{ app: ElectronApplication; window: Page }> {
  const bundled = path.join(tmp, "bundled-grants");
  await writeFixturePackage(bundled);
  const executable = process.env.GW_APP_EXECUTABLE;
  const linuxArgs = process.platform === "linux" ? ["--no-sandbox"] : [];
  const app = await electron.launch({
    ...(executable ? { executablePath: executable, args: linuxArgs } : { args: [appDir, ...linuxArgs], cwd: appDir }),
    env: {
      ...process.env,
      GW_USER_DATA_DIR: path.join(tmp, "appdata"),
      GW_DOCUMENTS_DIR: path.join(tmp, "Documents"),
      GW_BUNDLED_GRANTS_DIR: bundled,
    } as Record<string, string>,
  });
  const window = await app.firstWindow();
  await expect(window.getByTestId("app")).toHaveAttribute("data-engine", "ready", { timeout: 15_000 });
  return { app, window };
}

async function createApplication(window: Page) {
  await window.getByRole("button", { name: "Menu", exact: true }).click();
  const drawer = window.getByTestId("drawer");
  await expect(drawer).toBeVisible();
  await window.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));
  await drawer.getByRole("button", { name: "New application" }).click();
  const form = drawer.getByRole("form", { name: "New application" });
  await expect(form.getByLabel("Grant")).toHaveValue("crcp-r19");
  await form.getByLabel("Client").fill("Viewer Test");
  await form.getByRole("button", { name: "Create" }).click();
  await expect(window.getByTestId("topbar")).toContainText("Viewer Test");
  const grantSection = window.getByTestId("left-panel").getByRole("button", { name: /CRC-P documents/i });
  if ((await grantSection.getAttribute("aria-expanded")) !== "true") await grantSection.click();
}

async function openTreeItem(window: Page, name: RegExp) {
  const button = window.getByTestId("left-panel").getByRole("button", { name });
  await expect(button).toBeVisible();
  await button.click();
}

test("WP-2: PDF, DOCX, XLSX, Markdown and text open in the centre", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "gw-e2e-wp2-"));
  const { app, window } = await launch(tmp);
  try {
    await createApplication(window);

    await openTreeItem(window, /guidelines/i);
    const pdf = window.getByTestId("pdf-viewer");
    await expect(pdf).toBeVisible({ timeout: 20_000 });
    await expect.poll(async () => pdf.locator("canvas").first().evaluate((el) => (el as HTMLCanvasElement).width)).toBeGreaterThan(0);

    await openTreeItem(window, /partners-agreement-template/i);
    const docx = window.getByTestId("docx-viewer");
    await expect(docx).toBeVisible({ timeout: 20_000 });
    await expect.poll(async () => docx.evaluate((el) => el.childElementCount), { timeout: 20_000 }).toBeGreaterThan(0);

    await openTreeItem(window, /financial-workbook/i);
    const xlsx = window.getByTestId("xlsx-viewer");
    await expect(xlsx).toBeVisible({ timeout: 20_000 });
    await expect(xlsx.locator("tr").first()).toBeVisible();

    await openTreeItem(window, /viewer-notes.*md/i);
    await expect(window.getByTestId("md-viewer").getByRole("heading", { name: "Viewer fixture" })).toBeVisible();

    await openTreeItem(window, /viewer-notes.*txt/i);
    await expect(window.getByTestId("txt-viewer")).toContainText("Plain text renders in-app.");
  } finally {
    await app.close();
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
});
