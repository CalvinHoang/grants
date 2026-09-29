import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { findModelIds, inScope } from "./check-model-ids.mjs";

// IDs are assembled at runtime so this file never contains one itself.
const id = (...parts) => parts.join("-");

function repo(files) {
  const root = mkdtempSync(path.join(os.tmpdir(), "gw-model-ids-"));
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), text);
  }
  return { root, files: Object.keys(files) };
}

describe("check-model-ids", () => {
  it("flags model IDs in source and prompt files", () => {
    const { root, files } = repo({
      "packages/engine/src/draft.ts": `const m = "${id("claude", "sonnet", "5")}";\n`,
      "prompts/drafter.md": `Use ${id("gpt", "6")} here\n`,
      "packages/engine/src/jev.ts": `model: "${id("jev", "1.13.0")}"\n`,
    });
    const found = findModelIds(root, files);
    expect(found.map((f) => f.file).sort()).toEqual(
      ["packages/engine/src/draft.ts", "packages/engine/src/jev.ts", "prompts/drafter.md"].sort(),
    );
    expect(found[0]?.line).toBe(1);
  });

  it("allows the shipped models.json and skips docs, reference and design", () => {
    const text = `"${id("claude", "opus", "5")}"\n`;
    const { root, files } = repo({
      "config/models.json": text,
      "apps/desktop/resources/models.json": text,
      "docs/spec/05.md": text,
      "reference/crc-p/notes.md": text,
      "design/mockup/x.html": text,
    });
    expect(findModelIds(root, files)).toEqual([]);
  });

  it("flags a models.json outside the allowed paths", () => {
    const { root, files } = repo({
      "packages/engine/src/prompts/models.json": `"${id("claude", "haiku", "4")}"\n`,
    });
    expect(findModelIds(root, files)).toHaveLength(1);
  });

  it("flags other providers' IDs", () => {
    const { root, files } = repo({
      "a.ts": `const m = "${"o"}3";\n`,
      "b.ts": `const m = "${id("gpt", "oss", "120b")}";\n`,
      "c.ts": `const m = "${id("deepseek", "v3")}";\n`,
    });
    expect(findModelIds(root, files).map((f) => f.file)).toEqual(["a.ts", "b.ts", "c.ts"]);
  });

  it("flags any exact ID listed in the shipped models.json", () => {
    const custom = id("acme", "writer", "7");
    const { root, files } = repo({
      "config/models.json": JSON.stringify({
        roles: { drafter: { provider: "acme", model: custom }, chat: { provider: "acme", model: custom, choices: [custom] } },
        prices: { [custom]: {} },
      }),
      "packages/engine/src/draft.ts": `const m = "${custom}";\n`,
      "packages/engine/src/ok.ts": `const m = "${custom}-not-quite-x";\n`.replace(custom + "-", "prefix-"),
    });
    expect(findModelIds(root, files).map((f) => f.file)).toEqual(["packages/engine/src/draft.ts"]);
  });

  it("does not flag role names or ordinary words", () => {
    const { root, files } = repo({
      "packages/engine/src/roles.ts": 'const roles = ["drafter", "worker", "extractor", "decider", "chat"]; // claude-code, o1 notes\n',
    });
    expect(findModelIds(root, files)).toEqual([]);
  });

  it("scopes by path", () => {
    expect(inScope("packages/shared/src/models.ts")).toBe(true);
    expect(inScope("config/models.json")).toBe(false);
    expect(inScope("packages/shared/models.json")).toBe(true);
    expect(inScope("package-lock.json")).toBe(false);
    expect(inScope("reference/crc-p/source/a.pdf")).toBe(false);
  });
});
