// F-01 done-checks (build spec §6 F-01, WP-1) run against the built app, on the layout fixture
// (the synthetic client, §11). Screenshots land in test-results/ for comparison with the mockup.
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { launch, newProfile, resultsDir } from "./app";

const shot = (name: string) => path.join(resultsDir, "shell", `${name}.png`);

/** Waits for panel and drawer slides to finish: no sliding flag and no transition running. */
async function settle(window: Page) {
  await window.waitForFunction(
    () => !document.querySelector("[data-sliding]") && document.getAnimations().every((a) => a.playState !== "running"),
  );
}

/** True while the grid is animating a panel slide. */
const sliding = (window: Page) =>
  window.evaluate(() =>
    (document.querySelector(".workspace")?.getAnimations() ?? []).some(
      (a) => (a as CSSTransition).transitionProperty === "grid-template-columns",
    ),
  );

async function box(window: Page, testId: string) {
  const b = await window.getByTestId(testId).boundingBox();
  if (!b) throw new Error(`${testId} has no box`);
  return b;
}

test("AC1: launches to a usable window within 3 s", async () => {
  const started = Date.now();
  const { app, window } = await launch();
  try {
    await expect(window.getByTestId("workspace")).toBeVisible({ timeout: 10_000 });
    await expect(window.getByRole("button", { name: "Menu", exact: true })).toBeEnabled();
    const elapsed = Date.now() - started;
    test.info().annotations.push({ type: "launch-ms", description: String(elapsed) });
    process.stdout.write(`launch to usable window: ${elapsed} ms\n`);
    expect(elapsed).toBeLessThanOrEqual(3000);
  } finally {
    await app.close();
  }
});

test("layout: top bar, five tree headings in order with default states, centre and right panel", async () => {
  const { app, window } = await launch();
  try {
    await expect(window.getByTestId("workspace")).toBeVisible();
    await expect(window.getByTestId("app")).toHaveAttribute("data-engine", "ready", { timeout: 15_000 });

    // Top bar: menu button and the application name, nothing else.
    const topbar = window.getByTestId("topbar");
    await expect(topbar.getByRole("button")).toHaveCount(1);
    await expect(topbar).toContainText("Harbour Robotics");

    const headings = window.getByTestId("left-panel").locator(".tree-heading");
    await expect(headings).toHaveText([
      "CRC-P documents",
      "Workflow documents",
      "Deliverables",
      "Source documents",
      "References and templates",
    ]);
    const expanded = await headings.evaluateAll((els) => els.map((e) => e.getAttribute("aria-expanded")));
    expect(expanded).toEqual(["false", "false", "true", "true", "true"]);

    // Source documents nest Linked · SharePoint and Local · this application.
    const left = window.getByTestId("left-panel");
    await expect(left.getByText("Linked · SharePoint")).toBeVisible();
    await expect(left.getByText("Local · this application")).toBeVisible();

    // Sizes from the mockup at 1440×900.
    expect((await box(window, "topbar")).height).toBe(56);
    expect((await box(window, "left-panel")).width).toBe(256);
    expect((await box(window, "right-panel")).width).toBe(380);
    const centre = await box(window, "centre");
    expect(centre.x).toBe(256);
    expect(centre.width).toBe(1440 - 256 - 380);

    // Default centre view is the application draft; tree items switch it.
    await expect(window.getByTestId("centre")).toHaveAttribute("data-view", "draft");
    await left.getByRole("button", { name: /Project plan v3/ }).click();
    await expect(window.getByTestId("centre")).toHaveAttribute("data-view", "D002");
    await left.getByRole("button", { name: /R&D application/ }).click();
    await expect(window.getByTestId("centre")).toHaveAttribute("data-view", "draft");

    // Collapsed sections open on click.
    await left.getByRole("button", { name: "CRC-P documents" }).click();
    await expect(left.getByRole("button", { name: /Guidelines/ })).toBeVisible();
  } finally {
    await app.close();
  }
});

test("AC2: collapse and reopen each panel 20 times with no layout jump", async () => {
  const { app, window } = await launch();
  try {
    await expect(window.getByTestId("workspace")).toBeVisible();
    const itemCount = await window.getByTestId("left-panel").locator(".tree-item").count();
    const pageTop = (await box(window, "page")).y;

    for (const side of ["left", "right"] as const) {
      const panelId = `${side}-panel`;
      const width = (await box(window, panelId)).width;
      for (let i = 0; i < 20; i++) {
        await window.getByRole("button", { name: `Collapse ${side} panel` }).click();
        // It slides (a running transition), and mid-slide the panel keeps its width: no reflow.
        expect(await sliding(window)).toBe(true);
        expect((await box(window, panelId)).width).toBe(width);
        await settle(window);
        await expect(window.getByTestId(panelId)).toBeHidden();
        const other = side === "left" ? 380 : 256;
        const collapsed = await box(window, "centre");
        expect(collapsed.width).toBe(1440 - other);
        expect(collapsed.x).toBe(side === "left" ? 0 : 256);
        expect((await box(window, "page")).y).toBe(pageTop);

        await window.getByRole("button", { name: `Open ${side} panel` }).click();
        expect(await sliding(window)).toBe(true);
        await settle(window);
        await expect(window.getByTestId(panelId)).toBeVisible();
        expect((await box(window, panelId)).width).toBe(width);
        const reopened = await box(window, "centre");
        expect(reopened.width).toBe(1440 - 256 - 380);
        expect((await box(window, "page")).y).toBe(pageTop);
      }
    }
    expect(await window.getByTestId("left-panel").locator(".tree-item").count()).toBe(itemCount);
    await expect(window.getByTestId("right-panel").getByRole("heading", { name: "Issues" })).toBeVisible();

    // Both collapsed: the centre fills the window.
    await window.getByRole("button", { name: "Collapse left panel" }).click();
    await window.getByRole("button", { name: "Collapse right panel" }).click();
    await settle(window);
    expect((await box(window, "centre")).width).toBe(1440);
    await window.screenshot({ path: shot("collapsed") });
  } finally {
    await app.close();
  }
});

test("panels resize between 220 and 480 px, by mouse and keyboard, and the width is remembered", async () => {
  const profile = newProfile();
  let { app, window } = await launch({ profile });
  try {
    await expect(window.getByTestId("workspace")).toBeVisible();
    const drag = async (side: "left" | "right", dx: number) => {
      const h = await box(window, `resize-${side}`);
      const x = h.x + h.width / 2;
      const y = h.y + 300;
      await window.mouse.move(x, y);
      await window.mouse.down();
      await window.mouse.move(x + dx / 2, y, { steps: 4 });
      await window.mouse.move(x + dx, y, { steps: 4 });
      await window.mouse.up();
    };

    await drag("left", 400);
    expect((await box(window, "left-panel")).width).toBe(480);
    await drag("left", -500);
    expect((await box(window, "left-panel")).width).toBe(220);
    await drag("right", -300);
    expect((await box(window, "right-panel")).width).toBe(480);

    // Keyboard: arrows move the separator 16 px.
    await window.getByTestId("resize-left").focus();
    await window.keyboard.press("ArrowRight");
    await window.keyboard.press("ArrowRight");
    expect((await box(window, "left-panel")).width).toBe(252);
    await window.getByTestId("resize-right").focus();
    await window.keyboard.press("Home");
    expect((await box(window, "right-panel")).width).toBe(220);
    await window.keyboard.press("ArrowLeft");
    expect((await box(window, "right-panel")).width).toBe(236);

    // Centre fills whatever is left.
    expect((await box(window, "centre")).width).toBe(1440 - 252 - 236);

    // Collapse state and tree sections are remembered too.
    await window.getByTestId("left-panel").getByRole("button", { name: "Workflow documents" }).click();
    await window.getByRole("button", { name: "Collapse right panel" }).click();
    await settle(window);

    await app.close();
    ({ app, window } = await launch({ profile }));
    await expect(window.getByTestId("workspace")).toBeVisible();
    expect((await box(window, "left-panel")).width).toBe(252);
    await expect(window.getByTestId("right-panel")).toBeHidden();
    await expect(
      window.getByTestId("left-panel").getByRole("button", { name: "Workflow documents" }),
    ).toHaveAttribute("aria-expanded", "true");
    await window.getByRole("button", { name: "Open right panel" }).click();
    await settle(window);
    expect((await box(window, "right-panel")).width).toBe(236);
  } finally {
    await app.close();
  }
});

test("drawer: Applications, New application, Export, Settings; Escape closes and focus returns", async () => {
  const { app, window } = await launch();
  try {
    await expect(window.getByTestId("workspace")).toBeVisible();
    const menu = window.getByRole("button", { name: "Menu", exact: true });
    await menu.focus();
    await window.keyboard.press("Enter");
    const drawer = window.getByTestId("drawer");
    await expect(drawer).toBeVisible();
    await settle(window);
    await expect(drawer.getByRole("button", { name: "New application" })).toBeFocused();
    for (const name of ["Harbour Robotics", "Export as Word", "Export as PDF", "Settings"]) {
      await expect(drawer.getByRole("button", { name: new RegExp(name) })).toBeVisible();
    }
    expect((await drawer.boundingBox())?.x).toBe(0);
    await window.screenshot({ path: shot("drawer") });

    // New application form.
    await window.keyboard.press("Enter");
    await expect(drawer.getByLabel("Client")).toBeFocused();

    // Tab stays inside the drawer.
    for (let i = 0; i < 15; i++) {
      await window.keyboard.press("Tab");
      expect(await window.evaluate(() => !!document.activeElement?.closest("[data-testid=drawer]"))).toBe(true);
    }

    await window.keyboard.press("Escape"); // closes the form
    await window.keyboard.press("Escape"); // closes the drawer
    await expect(drawer).toBeHidden();
    await expect(menu).toBeFocused();

    // Switching application.
    await menu.click();
    await drawer.getByRole("button", { name: /Coastal Aquaculture/ }).click();
    await expect(window.getByTestId("topbar")).toContainText("Coastal Aquaculture");
    await expect(drawer).toBeHidden();
    await expect(menu).toBeFocused();
  } finally {
    await app.close();
  }
});

test("settings skeleton: account, keys, models, threshold, usage", async () => {
  const { app, window } = await launch();
  try {
    await expect(window.getByTestId("workspace")).toBeVisible();
    await window.getByRole("button", { name: "Menu", exact: true }).click();
    await window.getByTestId("drawer").getByRole("button", { name: "Settings" }).click();
    const settings = window.getByTestId("settings");
    await expect(settings).toBeVisible();
    await expect(settings.getByRole("heading", { level: 2 })).toHaveText([
      "Microsoft account",
      "API keys",
      "Models",
      "Threshold",
      "Usage",
    ]);
    for (const role of ["drafter", "worker", "extractor", "decider", "chat"]) {
      await expect(settings.locator(`[data-role=${role}]`)).toBeVisible();
    }
    // Key inputs are password fields: typed keys never show.
    await expect(settings.getByTestId("key-anthropic-input")).toHaveAttribute("type", "password");
    await window.screenshot({ path: shot("settings") });
    await window.keyboard.press("Escape");
    await expect(settings).toBeHidden();
    await expect(window.getByTestId("workspace")).toBeVisible();
  } finally {
    await app.close();
  }
});

test("AC3: main view matches the mockup's layout and colours, with no hint text", async () => {
  const { app, window } = await launch();
  try {
    await expect(window.getByTestId("workspace")).toBeVisible();
    await window.evaluate(() => document.fonts.ready);
    await window.screenshot({ path: shot("main") });

    const colours = await window.evaluate(() => {
      const bg = (sel: string) => getComputedStyle(document.querySelector(sel)!).backgroundColor;
      return {
        topbar: bg(".topbar"),
        left: bg(".left-panel"),
        centre: bg(".centre"),
        right: bg(".right-panel"),
        send: bg("[aria-label=Send]"),
        font: getComputedStyle(document.body).fontFamily,
        appName: getComputedStyle(document.querySelector(".app-name")!).fontFamily,
      };
    });
    // Mockup: #efece5 chrome, #e6e2da centre, #fbfaf7 right panel, #a34a28 accent.
    expect(colours).toMatchObject({
      topbar: "rgb(239, 236, 229)",
      left: "rgb(239, 236, 229)",
      centre: "rgb(230, 226, 218)",
      right: "rgb(251, 250, 247)",
      send: "rgb(163, 74, 40)",
    });
    expect(colours.font).toContain("Geist");
    expect(colours.appName).toContain("Source Serif 4");
    expect(await window.evaluate(() => document.fonts.check('14px "Geist Variable"'))).toBe(true);

    // Spec 03 §5: no helper text, tips or status chatter anywhere on screen.
    const text = (await window.locator("body").innerText()).toLowerCase();
    for (const phrase of ["click", "drag", "drop files", "tip:", "loading", "please", "welcome", "here to", "you can"]) {
      expect(text, `found "${phrase}" on screen`).not.toContain(phrase);
    }

    // Dark mode follows the system.
    await window.emulateMedia({ colorScheme: "dark" });
    await window.screenshot({ path: shot("main-dark") });
    expect(await window.evaluate(() => getComputedStyle(document.querySelector(".topbar")!).backgroundColor)).not.toBe(
      "rgb(239, 236, 229)",
    );
  } finally {
    await app.close();
  }
});

/**
 * Tabs through the page from the start and checks that every visible, enabled control inside
 * `scope` is reached (by identity, not name) and shows a 2 px focus ring that isn't clipped.
 */
async function tabThrough(window: Page, scope: string) {
  const total = await window.evaluate((scope) => {
    const root = document.querySelector(scope)!;
    const els = [...root.querySelectorAll<HTMLElement>("button, input, select, textarea, [tabindex='0']")].filter(
      (e) => e.getClientRects().length > 0 && !e.closest("[inert]") && !(e as HTMLButtonElement).disabled,
    );
    els.forEach((e, i) => (e.dataset.tabProbe = String(i)));
    return els.length;
  }, scope);
  expect(total).toBeGreaterThan(0);
  const reached = new Set<string>();
  const problems: string[] = [];
  for (let i = 0; i < total * 2 + 10 && reached.size < total; i++) {
    await window.keyboard.press("Tab");
    const info = await window.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      const probe = el?.dataset.tabProbe;
      if (!el || probe === undefined) return null;
      const ringEl = el.matches(".composer-input") ? el.closest<HTMLElement>(".composer")! : el;
      const style = getComputedStyle(ringEl);
      const ring = style.outlineStyle !== "none" && parseFloat(style.outlineWidth) >= 2;
      // The ring must be on screen: not cut off by a clipping ancestor.
      const r = ringEl.getBoundingClientRect();
      const x = Math.min(Math.max(r.left + 1, 0), globalThis.innerWidth - 1);
      const y = Math.min(Math.max(r.top + r.height / 2, 0), globalThis.innerHeight - 1);
      const visible = ringEl.contains(document.elementFromPoint(x, y)) || document.elementFromPoint(x, y) === ringEl;
      return { probe, name: el.getAttribute("aria-label") ?? el.textContent?.trim() ?? el.tagName, ring, visible };
    });
    if (!info) continue;
    reached.add(info.probe);
    if (!info.ring) problems.push(`no ring: ${info.name}`);
    if (!info.visible) problems.push(`ring hidden: ${info.name}`);
  }
  const missing = await window.evaluate(
    (reached) =>
      [...document.querySelectorAll<HTMLElement>("[data-tab-probe]")]
        .filter((e) => !reached.includes(e.dataset.tabProbe!))
        .map((e) => e.getAttribute("aria-label") ?? e.textContent?.trim() ?? e.tagName),
    [...reached],
  );
  await window.evaluate(() => document.querySelectorAll("[data-tab-probe]").forEach((e) => e.removeAttribute("data-tab-probe")));
  expect(missing, "not reachable by Tab").toEqual([]);
  expect(problems).toEqual([]);
}

test("AC4: every control is reachable by keyboard and shows a focus ring", async () => {
  const { app, window } = await launch();
  try {
    await expect(window.getByTestId("workspace")).toBeVisible();
    // Open every collapsible section and a + card so their controls are in the pass too.
    const left = window.getByTestId("left-panel");
    await left.getByRole("button", { name: "CRC-P documents" }).click();
    await left.getByRole("button", { name: "Workflow documents" }).click();
    await left.getByRole("button", { name: "Add source documents" }).click();
    await window.locator("body").click({ position: { x: 700, y: 400 } });
    await tabThrough(window, ".app");

    // Drawer.
    await window.getByRole("button", { name: "Menu", exact: true }).focus();
    await window.keyboard.press("Enter");
    await settle(window);
    await window.getByTestId("drawer").getByRole("button", { name: "New application" }).press("Enter");
    await tabThrough(window, "[data-testid=drawer]");
    await window.keyboard.press("Escape");
    await window.keyboard.press("Escape");

    // Settings.
    await window.getByRole("button", { name: "Menu", exact: true }).press("Enter");
    await window.getByTestId("drawer").getByRole("button", { name: "Settings" }).press("Enter");
    await expect(window.getByTestId("settings")).toBeVisible();
    await settle(window); // the drawer's scrim fades out over it first
    await tabThrough(window, "[data-testid=settings]");
    await window.keyboard.press("Escape");

    // Panels collapse and reopen from the keyboard; the edge buttons get focus and a ring.
    await window.getByRole("button", { name: "Collapse left panel" }).focus();
    await window.keyboard.press("Enter");
    await settle(window);
    await expect(window.getByRole("button", { name: "Open left panel" })).toBeFocused();
    await window.screenshot({ path: shot("focus-ring") });
    await window.keyboard.press("Enter");
    await settle(window);
    await expect(window.getByRole("button", { name: "Collapse left panel" })).toBeFocused();
  } finally {
    await app.close();
  }
});

test("the centre keeps at least 360 px when the window is narrow and both panels are wide", async () => {
  const { app, window } = await launch();
  try {
    await expect(window.getByTestId("workspace")).toBeVisible();
    await window.getByTestId("resize-left").focus();
    await window.keyboard.press("End");
    await window.getByTestId("resize-right").focus();
    await window.keyboard.press("End");
    expect((await box(window, "centre")).width).toBe(1440 - 480 - 480);
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setContentSize(960, 700));
    await expect.poll(async () => (await box(window, "centre")).width).toBe(360);
    expect((await box(window, "left-panel")).width + (await box(window, "right-panel")).width).toBe(600);
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setContentSize(1440, 900));
    await expect.poll(async () => (await box(window, "right-panel")).width).toBe(480);
  } finally {
    await app.close();
  }
});

test("without an application the window opens on one short empty state", async () => {
  const { app, window } = await launch({ fixture: false });
  try {
    await expect(window.getByTestId("app")).toHaveAttribute("data-engine", "ready", { timeout: 15_000 });
    const empty = window.getByTestId("empty");
    await expect(empty).toBeVisible();
    await expect(empty.getByRole("button")).toHaveText("New application");
    await empty.getByRole("button").click();
    await expect(window.getByTestId("drawer")).toBeVisible();
    await window.screenshot({ path: shot("empty") });
  } finally {
    await app.close();
  }
});
