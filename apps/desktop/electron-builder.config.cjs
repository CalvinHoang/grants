// electron-builder config (§4.1): NSIS installer for Windows; no code signing or auto-update in v1.
const electronVersion = require("electron/package.json").version;

module.exports = {
  appId: "au.grantworkbench.app",
  productName: "Grant Workbench",
  executableName: "Grant Workbench",
  publish: null,
  electronVersion,
  directories: { output: "release" },
  files: ["dist/**/*", "!dist/**/*.map", "package.json"],
  // Grant packages ship with the app (§5.1); the engine installs them into the app data folder.
  extraResources: [{ from: "../../grants", to: "grants", filter: ["**/*", "!README.md"] }],
  // Everything is bundled into dist/ (the keyring binary is copied into dist/engine/node_modules by
  // build.mjs), so there are no runtime node_modules to collect.
  npmRebuild: false,
  nodeGypRebuild: false,
  asar: true,
  // Native .node files can't load from inside the asar archive.
  asarUnpack: ["dist/engine/node_modules/**"],
  win: {
    target: [{ target: "nsis", arch: ["x64"] }],
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
  },
};
