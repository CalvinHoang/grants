// Launch helper for the e2e checks: the built app (default) or a packaged executable
// (GW_APP_EXECUTABLE), each run on its own profile so remembered layout doesn't leak between tests.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron, type ElectronApplication, type Page } from "@playwright/test";

export const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const resultsDir = path.join(appDir, "test-results");

export function newProfile(): string {
  return mkdtempSync(path.join(tmpdir(), "gw-e2e-"));
}

export interface Launched {
  app: ElectronApplication;
  window: Page;
}

export async function launch(options: { profile?: string; fixture?: boolean } = {}): Promise<Launched> {
  const executable = process.env.GW_APP_EXECUTABLE;
  // Containers run as root without a user namespace, so Chromium's sandbox must be off there.
  const linuxArgs = process.platform === "linux" ? ["--no-sandbox"] : [];
  const args = [...linuxArgs, "--gw-e2e", `--gw-user-data=${options.profile ?? newProfile()}`];
  if (options.fixture ?? true) args.push("--gw-fixture=harbour");
  const app = await electron.launch(
    executable ? { executablePath: executable, args } : { args: [appDir, ...args], cwd: appDir },
  );
  const window = await app.firstWindow();
  // The mockup's frame: 1440×900 of content.
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setContentSize(1440, 900));
  return { app, window };
}
