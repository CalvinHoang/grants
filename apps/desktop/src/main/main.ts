// Electron main process: a thin launcher (§4.1). It creates the window, starts the engine in a
// utilityProcess and hands each side one end of a MessageChannel. It does no work of its own.
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  app,
  BrowserWindow,
  MessageChannelMain,
  nativeTheme,
  net,
  protocol,
  session,
  shell,
  utilityProcess,
  type UtilityProcess,
} from "electron";

const APP_SCHEME = "app";
const APP_ORIGIN = `${APP_SCHEME}://bundle`;
const distDir = path.join(__dirname, "..");
const rendererDir = path.join(distDir, "renderer");

// The renderer is served from a custom scheme rather than file:// so it gets a real origin and CSP.
protocol.registerSchemesAsPrivileged([
  { scheme: APP_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
]);

// Test hooks, honoured only with the explicit --gw-e2e switch the e2e launcher passes: each run
// gets its own profile (--gw-user-data) and may open the layout fixture (--gw-fixture=harbour).
const e2e = app.commandLine.hasSwitch("gw-e2e");
const testUserData = e2e ? app.commandLine.getSwitchValue("gw-user-data") : "";
const configuredAppData = testUserData || process.env.GW_APP_DATA || process.env.GW_USER_DATA_DIR || "";
if (configuredAppData) app.setPath("userData", configuredAppData);
const testFixture = e2e && app.commandLine.getSwitchValue("gw-fixture") === "harbour";

let engine: UtilityProcess | null = null;
let quitting = false;
/** Restart times in the last minute, to stop a crash loop. */
let restarts: number[] = [];
const MAX_RESTARTS_PER_MINUTE = 3;

/** Grant packages ship as extraResources when packaged; development reads the repo grants folder. */
function bundledGrantsDir(): string {
  if (process.env.GW_BUNDLED_GRANTS_DIR) return process.env.GW_BUNDLED_GRANTS_DIR;
  return app.isPackaged ? path.join(process.resourcesPath, "grants") : path.resolve(distDir, "..", "..", "..", "grants");
}

function startEngine(): UtilityProcess {
  const child = utilityProcess.fork(path.join(distDir, "engine", "engine.cjs"), [`--app-data=${app.getPath("userData")}`], {
    serviceName: "Grant Workbench engine",
    stdio: "inherit",
    env: {
      ...process.env,
      GW_APP_DATA_DIR: app.getPath("userData"),
      GW_DOCUMENTS_DIR: process.env.GW_DOCUMENTS_DIR || app.getPath("documents"),
      GW_BUNDLED_GRANTS_DIR: bundledGrantsDir(),
    },
  });
  child.on("exit", (code) => {
    if (engine !== child) return;
    engine = null;
    if (quitting) return;
    console.error(`engine exited with code ${code}`);
    // Restart and reconnect every window; runs resume from SQLite (§7.8 resumability).
    const now = Date.now();
    restarts = restarts.filter((t) => now - t < 60_000);
    if (restarts.length >= MAX_RESTARTS_PER_MINUTE) return;
    restarts.push(now);
    for (const win of BrowserWindow.getAllWindows()) connect(win);
  });
  return child;
}

/** Connects the window's renderer to the engine with a fresh channel (on every page load). */
function connect(win: BrowserWindow): void {
  engine ??= startEngine();
  const { port1, port2 } = new MessageChannelMain();
  engine.postMessage({ type: "engine-port" }, [port1]);
  win.webContents.postMessage("engine-port", null, [port2]);
}

function serveBundle(): void {
  protocol.handle(APP_SCHEME, (request) => {
    const url = new URL(request.url);
    if (url.host !== "bundle") return new Response("not found", { status: 404 });
    let relative: string;
    try {
      relative = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
    } catch {
      return new Response("bad request", { status: 400 });
    }
    const file = path.normalize(path.join(rendererDir, relative));
    if (!file.startsWith(rendererDir + path.sep)) return new Response("not found", { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });
}

function isAppUrl(url: string): boolean {
  try {
    return new URL(url).origin === APP_ORIGIN;
  } catch {
    return false;
  }
}

function harden(): void {
  // No permission (camera, notifications, …) is ever needed.
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  app.on("web-contents-created", (_event, contents) => {
    contents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith("https://")) void shell.openExternal(url);
      return { action: "deny" };
    });
    contents.on("will-navigate", (event, url) => {
      if (!isAppUrl(url)) event.preventDefault();
    });
    contents.on("will-attach-webview", (event) => event.preventDefault());
  });
}

// Matches the top bar in each theme, so there is no white flash before the page paints.
function windowBackground(): string {
  return nativeTheme.shouldUseDarkColors ? "#262522" : "#efece5";
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    title: "Grant Workbench",
    show: false,
    backgroundColor: windowBackground(),
    webPreferences: {
      preload: path.join(distDir, "preload", "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: true,
    },
  });
  win.once("ready-to-show", () => win.show());
  const onTheme = () => win.setBackgroundColor(windowBackground());
  nativeTheme.on("updated", onTheme);
  win.on("closed", () => nativeTheme.off("updated", onTheme));
  win.webContents.on("did-finish-load", () => connect(win));
  void win.loadURL(`${APP_ORIGIN}/index.html${testFixture ? "?fixture=harbour" : ""}`);
  return win;
}

const singleInstance = app.requestSingleInstanceLock();
if (!singleInstance) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const [win] = BrowserWindow.getAllWindows();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  void app.whenReady().then(() => {
    harden();
    serveBundle();
    createWindow();
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on("before-quit", () => {
    quitting = true;
  });

  app.on("window-all-closed", () => {
    quitting = true;
    engine?.kill();
    engine = null;
    app.quit();
  });
}
