// WP-0 done-check: the empty app launches, the UI sends one request to the engine over the
// MessagePort, and the reply comes back (validated by the shared schema on both sides).
//
// By default this launches the built app (`npm run build`). Set GW_APP_EXECUTABLE to a packaged
// executable (e.g. release/win-unpacked/Grant Workbench.exe) to smoke-test an installer build.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron, expect, test } from "@playwright/test";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("app launches and the UI gets a reply from the engine", async () => {
  const executable = process.env.GW_APP_EXECUTABLE;
  // Containers run as root without a user namespace, so Chromium's sandbox must be off there.
  const linuxArgs = process.platform === "linux" ? ["--no-sandbox"] : [];
  const app = await electron.launch(
    executable
      ? { executablePath: executable, args: linuxArgs }
      : { args: [appDir, ...linuxArgs], cwd: appDir },
  );
  try {
    const window = await app.firstWindow();
    await expect(window).toHaveTitle("Grant Workbench");

    const root = window.getByTestId("app");
    await expect(root).toHaveAttribute("data-engine", "ready", { timeout: 15_000 });
    await expect(root).toHaveAttribute("data-engine-version", /^\d+\.\d+\.\d+/);
    // node:sqlite loads inside the utilityProcess (§4.1 storage choice).
    await expect(root).toHaveAttribute("data-engine-sqlite", /^3\.\d+/);

    // Provider keys: the OS keyring loads and works inside the engine process on Windows (§4.1, WP-6).
    if (process.platform === "win32") {
      await expect(root).toHaveAttribute("data-engine-keystore", "credential-manager");
    } else {
      await expect(root).toHaveAttribute("data-engine-keystore", /^(credential-manager|memory)$/);
    }

    // The renderer is sandboxed and has no Node access.
    expect(await window.evaluate(() => typeof (globalThis as { require?: unknown }).require)).toBe("undefined");

    await window.screenshot({ path: path.join(appDir, "test-results", "smoke.png") });

    // If the engine dies, main restarts it and the window reconnects without a reload.
    const firstPid = Number(await root.getAttribute("data-engine-pid"));
    expect(firstPid).toBeGreaterThan(0);
    process.kill(firstPid, "SIGKILL");
    await expect(root).toHaveAttribute("data-engine-connection", /^[2-9]/, { timeout: 15_000 });
    await expect(root).toHaveAttribute("data-engine", "ready");
    expect(Number(await root.getAttribute("data-engine-pid"))).not.toBe(firstPid);
  } finally {
    await app.close();
  }
});
