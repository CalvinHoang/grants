// WP-6 done-checks in the running app (F-16): a role is switched in Settings with no restart and the
// next call uses it (and the calls table records it); switching the decider picks up that model's own
// threshold; a key saved in Settings reaches the provider but never lands in the app data folder.
// Providers are the local mock server; model IDs come from the shipped models.json, never this file.
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { _electron as electron, expect, test } from "@playwright/test";
import type { ModelsConfig } from "@gw/shared";
import { startMockProviders, type MockProviders } from "../../../packages/engine/src/models/testing/mock-providers";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const shipped = JSON.parse(
  readFileSync(path.resolve(appDir, "../../config/models.json"), "utf8"),
) as ModelsConfig;
const KEY = "sk-e2e-NEVER-ON-DISK-7c2d";

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)],
  );
}

let mock: MockProviders;
test.beforeAll(async () => {
  mock = await startMockProviders();
});
test.afterAll(async () => {
  await mock.close();
});

test("Settings switches model roles with no restart and keeps keys out of files", async () => {
  const data = mkdtempSync(path.join(tmpdir(), "gw-e2e-"));
  const config = structuredClone(shipped);
  config.providers.anthropic!.base_url = mock.url;
  config.providers.openai!.base_url = `${mock.url}/v1`;
  config.providers.jev!.base_url = mock.url;
  const jevModel = config.providers.jev!.models![0]!;
  config.decision_models = {
    ...config.decision_models,
    [jevModel]: { threshold: 0.95, state_limit_tokens: 32000 },
    [config.roles.decider.model]: { threshold: 0.9, state_limit_tokens: 100000 },
  };
  writeFileSync(path.join(data, "models.json"), JSON.stringify(config, null, 2));

  const executable = process.env.GW_APP_EXECUTABLE;
  const linuxArgs = process.platform === "linux" ? ["--no-sandbox"] : [];
  // Linux containers have no Credential Manager; on Windows the real one is used and cleaned up below.
  const env = {
    ...process.env,
    GW_APP_DATA: data,
    ...(process.platform === "linux" ? { GW_KEYSTORE: "memory" } : {}),
  } as Record<string, string>;
  const app = await electron.launch(
    executable ? { executablePath: executable, args: linuxArgs, env } : { args: [appDir, ...linuxArgs], cwd: appDir, env },
  );
  try {
    const window = await app.firstWindow();
    await expect(window.getByTestId("app")).toHaveAttribute("data-engine", "ready", { timeout: 15_000 });
    await window.getByRole("button", { name: "Menu", exact: true }).click();
    await window.getByTestId("drawer").getByRole("button", { name: "Settings" }).click();
    const settings = window.getByTestId("model-settings");
    await expect(settings.getByTestId("role-worker-model")).toBeVisible();

    // Save a key; the field clears and the provider shows a stored key.
    await settings.getByTestId("key-anthropic-input").fill(KEY);
    await settings.getByTestId("key-anthropic-save").click();
    await expect(settings.getByTestId("key-anthropic")).toHaveAttribute("data-present", "true");
    await expect(settings.getByTestId("key-anthropic-input")).toHaveValue("");

    // Test the worker role as configured.
    const firstModel = config.roles.worker.model;
    await settings.getByTestId("role-worker-test").click();
    await expect(settings.getByTestId("role-worker-result")).toHaveAttribute("data-ok", "true", { timeout: 20_000 });

    // Switch the worker to another model and test again: the next call uses it, no restart.
    const otherModel = config.providers.anthropic!.models!.find((m) => m !== firstModel)!;
    await settings.getByTestId("role-worker-model").selectOption(otherModel);
    await expect(settings.getByTestId("role-worker-model")).toHaveValue(otherModel);
    await settings.getByTestId("role-worker-test").click();
    await expect(settings.getByTestId("role-worker-result")).toHaveAttribute("data-ok", "true", { timeout: 20_000 });
    await expect(settings.getByTestId("usage-total")).toHaveAttribute("data-calls", "2");

    const workerCalls = mock.requests.filter((r) => r.path === "/v1/messages").map((r) => r.model);
    expect(workerCalls).toEqual([firstModel, otherModel]);
    expect(mock.requests.every((r) => r.credential === KEY)).toBe(true);

    // The decider switches from the LLM stand-in to jev and shows jev's own threshold.
    await expect(settings.getByTestId("decider-threshold")).toHaveValue("0.9");
    await settings.getByTestId("role-decider-provider").selectOption("jev");
    await expect(settings.getByTestId("role-decider-model")).toHaveValue(jevModel);
    await expect(settings.getByTestId("decider-threshold")).toHaveValue("0.95");

    // A mapping that lacks what the role needs is refused and nothing changes.
    await settings.getByTestId("role-drafter-provider").selectOption("microsoft365");
    await expect(settings.getByTestId("models-error")).toBeVisible();
    await expect(settings.getByTestId("role-drafter-provider")).toHaveValue(config.roles.drafter.provider);

    await window.screenshot({ path: path.join(appDir, "test-results", "settings-models.png") });

    await settings.getByTestId("key-anthropic-remove").click();
    await expect(settings.getByTestId("key-anthropic")).toHaveAttribute("data-present", "false");
  } finally {
    await app.close();
  }

  // models.json on disk carries the switch; the calls table recorded both worker models.
  const saved = JSON.parse(readFileSync(path.join(data, "models.json"), "utf8")) as ModelsConfig;
  expect(saved.roles.decider.provider).toBe("jev");
  const db = new DatabaseSync(path.join(data, "usage.db"), { readOnly: true });
  const rows = db.prepare("select role, model_id from calls order by id").all() as { role: string; model_id: string }[];
  db.close();
  expect(rows).toEqual([
    { role: "worker", model_id: config.roles.worker.model },
    { role: "worker", model_id: config.providers.anthropic!.models!.find((m) => m !== config.roles.worker.model) },
  ]);

  // F-16 AC1: the key appears nowhere in the app data folder (engine files and the Chromium profile).
  const hits = walk(data).filter((f) => readFileSync(f).includes(Buffer.from(KEY)));
  expect(hits).toEqual([]);
});
