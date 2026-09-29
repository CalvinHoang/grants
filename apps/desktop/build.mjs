// Bundles the Electron main process, the preload script and the engine with esbuild.
// The renderer is built by Vite (vite.config.ts). The only runtime module outside the bundles is the
// native OS keyring (@napi-rs/keyring, §4.1), copied beside the engine for this platform.
import { cpSync, existsSync, readdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { build } from "esbuild";

const common = {
  bundle: true,
  platform: "node",
  target: "node24",
  sourcemap: true,
  logLevel: "info",
  external: ["electron"],
};

await Promise.all([
  build({ ...common, entryPoints: ["src/main/main.ts"], outfile: "dist/main/main.cjs", format: "cjs" }),
  // Sandboxed preloads must be a single CommonJS file.
  build({ ...common, entryPoints: ["src/preload/preload.ts"], outfile: "dist/preload/preload.cjs", format: "cjs" }),
  build({
    ...common,
    entryPoints: ["../../packages/engine/src/utility-process.ts"],
    outfile: "dist/engine/engine.cjs",
    format: "cjs",
    external: [...common.external, "@napi-rs/keyring"],
    // keys.ts falls back to import.meta.url only outside CommonJS.
    define: { "import.meta.url": "undefined" },
  }),
]);

// Copy @napi-rs/keyring and the platform binaries npm installed next to it into dist/engine/node_modules.
const require = createRequire(path.resolve("../../packages/engine/package.json"));
const keyringDir = path.dirname(require.resolve("@napi-rs/keyring/package.json"));
const scopeDir = path.dirname(keyringDir);
const target = path.resolve("dist/engine/node_modules/@napi-rs");
if (existsSync(target)) rmSync(target, { recursive: true });
for (const name of readdirSync(scopeDir)) {
  if (name === "keyring" || name.startsWith("keyring-")) {
    cpSync(path.join(scopeDir, name), path.join(target, name), { recursive: true, dereference: true });
  }
}
