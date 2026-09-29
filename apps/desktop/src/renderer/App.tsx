// The window (F-01, spec 03 §2): top bar, menu drawer, left tree, centre and right panel, and the
// Settings screen. The engine handshake result stays in data attributes for tests, not on screen
// (no status chatter, spec 03 §5).
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { EngineInfo, GrantManifest, RpcClient } from "@gw/shared";
import type { EngineConnection } from "./engine";
import { Centre } from "./components/Centre";
import { Drawer, type GrantChoice } from "./components/Drawer";
import { LeftPanel } from "./components/LeftPanel";
import { MenuIcon } from "./components/icons";
import { ResizeHandle } from "./components/ResizeHandle";
import { RightPanel } from "./components/RightPanel";
import { Settings, type SettingsData } from "./components/Settings";
import { FIXTURE_APPLICATIONS, fixtureView } from "./state/fixture";
import { fitWidths, loadLayout, saveLayout, type LayoutPrefs, type SectionKey } from "./state/layout";
import { DRAFT_VIEW, buildView, findItem, type ApplicationListItem, type ApplicationView } from "./state/workspace";

type EngineState =
  | { status: "connecting" }
  | { status: "ready"; info: EngineInfo; connection: number }
  | { status: "error" };

const EMPTY_SETTINGS: SettingsData = {
  providers: [],
  roles: { drafter: null, worker: null, extractor: null, decider: null, chat: null },
  threshold: null,
  costUsd: 0,
  microsoftAccount: null,
  chatChoices: [],
};

/** GW_FIXTURE=harbour starts the app on the layout fixture (see state/fixture.ts). */
const fixture = new URLSearchParams(window.location.search).get("fixture") === "harbour";

export function App({ engine }: { engine: EngineConnection }) {
  const [engineState, setEngineState] = useState<EngineState>({ status: "connecting" });
  const [client, setClient] = useState<RpcClient | null>(null);
  const [applications, setApplications] = useState<ApplicationListItem[]>(fixture ? FIXTURE_APPLICATIONS : []);
  const [grants, setGrants] = useState<GrantManifest[]>([]);
  const [view, setView] = useState<ApplicationView | null>(fixture ? fixtureView("harbour") : null);
  const [selected, setSelected] = useState(DRAFT_VIEW);
  const [selectedIssue, setSelectedIssue] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<SettingsData>(
    fixture ? { ...EMPTY_SETTINGS, providers: ["anthropic", "openai", "jev"] } : EMPTY_SETTINGS,
  );
  const [layout, setLayout] = useState<LayoutPrefs>(loadLayout);
  const [resizing, setResizing] = useState(false);
  const [sliding, setSliding] = useState(false);
  const slideTimer = useRef<number | undefined>(undefined);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const menuButton = useRef<HTMLButtonElement>(null);

  // Saved when a change settles, not on every pointer move of a drag.
  useEffect(() => {
    if (!resizing) saveLayout(layout);
  }, [layout, resizing]);

  useEffect(() => {
    const onResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.clearTimeout(slideTimer.current);
    };
  }, []);

  // Engine handshake, then whatever the engine can serve so far (applications: WP-4, models: WP-6).
  // Runs on every connection, including a reconnect after the engine restarts.
  useEffect(() => {
    let cancelled = false;
    let connection = 0;
    const handshake = async () => {
      const n = ++connection;
      const c = engine.client;
      try {
        const info = await c.request("settings.engineInfo", {});
        if (cancelled) return;
        setClient(c);
        setEngineState({ status: "ready", info, connection: n });
      } catch {
        if (!cancelled) setEngineState({ status: "error" });
        return;
      }
      c.request("settings.getModels", {})
        .then((m) => {
          if (cancelled) return;
          setSettings((s) => ({
            ...s,
            providers: Object.keys(m.providers),
            roles: {
              drafter: m.roles.drafter.model,
              worker: m.roles.worker.model,
              extractor: m.roles.extractor.model,
              decider: m.roles.decider.model,
              chat: m.roles.chat.model,
            },
            threshold: m.roles.decider.threshold,
            chatChoices: m.roles.chat.choices,
          }));
        })
        .catch(() => undefined);
      if (fixture) return;
      try {
        const [{ grants: g }, { applications: apps }, ui] = await Promise.all([
          c.request("project.listGrants", {}),
          c.request("project.list", {}),
          c.request("settings.getUiState", {}),
        ]);
        if (cancelled) return;
        setGrants(g);
        setApplications(apps.map((a) => ({ id: a.id, clientName: a.clientName, grant: grantShort(g, a.packageId) })));

        if (ui.lastApplicationId && apps.some((a) => a.id === ui.lastApplicationId)) {
          const app = await c.request("project.open", { applicationId: ui.lastApplicationId });
          const { documents } = await c
            .request("documents.list", { applicationId: app.id })
            .catch(() => ({ documents: [] }));
          if (!cancelled) setView(buildView(app, g.find((grant) => grant.id === app.packageId), documents));
        }
      } catch {
        // Not served yet (WP-4): the window opens on the empty state.
      }
    };
    // The first port arrives through onConnect too; `ready` covers a port that came before mount.
    engine.onConnect(() => void handshake());
    void engine.ready.then(() => {
      if (connection === 0) void handshake();
    });
    return () => {
      cancelled = true;
    };
  }, [engine]);

  const openApplication = useCallback(
    async (id: string) => {
      setDrawerOpen(false);
      menuButton.current?.focus();
      setSelected(DRAFT_VIEW);
      setSelectedIssue(null);
      if (fixture) {
        setView(fixtureView(id));
        return;
      }
      if (!client) return;
      try {
        const app = await client.request("project.open", { applicationId: id });
        const { documents } = await client.request("documents.list", { applicationId: id }).catch(() => ({ documents: [] }));
        setView(buildView(app, grants.find((g) => g.id === app.packageId), documents));
      } catch {
        // Stays on the current application.
      }
    },
    [client, grants],
  );

  const createApplication = useCallback(
    async (packageId: string, clientName: string) => {
      if (!client) throw new Error("engine not ready");
      const created = await client.request("project.create", { packageId, clientName });
      setApplications((list) => [...list, { id: created.id, clientName: created.clientName, grant: grantShort(grants, created.packageId) }]);

      // Windows can briefly hold files/folders just created (Defender/indexer). Creating succeeded,
      // so retry opening the new application instead of silently leaving the previous one selected.
      let opened: typeof created | null = null;
      let lastError: unknown = null;
      for (const delay of [0, 50, 100, 200, 400, 800]) {
        if (delay) await new Promise((resolve) => window.setTimeout(resolve, delay));
        try {
          opened = await client.request("project.open", { applicationId: created.id });
          break;
        } catch (error) {
          lastError = error;
        }
      }
      if (!opened) throw lastError instanceof Error ? lastError : new Error("Couldn't open the new application");

      const { documents } = await client.request("documents.list", { applicationId: opened.id }).catch(() => ({ documents: [] }));
      setSelected(DRAFT_VIEW);
      setSelectedIssue(null);
      setDrawerOpen(false);
      menuButton.current?.focus();
      setView(buildView(opened, grants.find((g) => g.id === opened!.packageId), documents));
    },
    [client, grants],
  );

  const grantChoices: GrantChoice[] = useMemo(() => grants.map((g) => ({ id: g.id, name: g.name })), [grants]);

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
    menuButton.current?.focus();
  }, []);

  const setPanel = (side: "left" | "right", open: boolean) => {
    setSliding(true);
    window.clearTimeout(slideTimer.current);
    slideTimer.current = window.setTimeout(() => setSliding(false), 240);
    setLayout((l) => (side === "left" ? { ...l, leftOpen: open } : { ...l, rightOpen: open }));
    // Keep keyboard focus on the control that undoes the action (the old one becomes inert).
    const target = open ? `Collapse ${side} panel` : `Open ${side} panel`;
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[aria-label="${target}"]`)?.focus());
  };
  const resize = (side: "left" | "right") => (width: number, live: boolean) => {
    setResizing(live);
    setLayout((l) => (side === "left" ? { ...l, leftWidth: width } : { ...l, rightWidth: width }));
  };
  const toggleSection = (key: SectionKey) =>
    setLayout((l) => ({ ...l, sections: { ...l.sections, [key]: !l.sections[key] } }));

  const hasKey = useCallback(
    async (provider: string) => {
      if (!client) return false;
      return (await client.request("settings.hasKey", { provider })).present;
    },
    [client],
  );
  const saveKey = useCallback(
    async (provider: string, key: string) => {
      if (!client) throw new Error("engine not ready");
      await client.request("settings.setKey", { provider, key });
    },
    [client],
  );

  // Widths as shown: the stored preference, narrowed if the window can't fit it beside the centre.
  const { left: leftWidth, right: rightWidth } = fitWidths(layout, windowWidth);
  const gridStyle = {
    "--left-col": layout.leftOpen ? `${leftWidth}px` : "0px",
    "--right-col": layout.rightOpen ? `${rightWidth}px` : "0px",
    "--left-width": `${leftWidth}px`,
    "--right-width": `${rightWidth}px`,
  } as CSSProperties;

  return (
    <div
      className="app"
      data-testid="app"
      data-engine={engineState.status}
      data-engine-version={engineState.status === "ready" ? engineState.info.engineVersion : undefined}
      data-engine-sqlite={engineState.status === "ready" ? (engineState.info.sqlite ?? "none") : undefined}
      data-engine-keystore={engineState.status === "ready" ? engineState.info.keyStore : undefined}
      data-engine-pid={engineState.status === "ready" ? engineState.info.pid : undefined}
      data-engine-connection={engineState.status === "ready" ? engineState.connection : undefined}
    >
      <header className="topbar" data-testid="topbar">
        <button
          ref={menuButton}
          type="button"
          className="icon-button menu-button"
          aria-label="Menu"
          aria-expanded={drawerOpen}
          data-open={drawerOpen}
          onClick={() => setDrawerOpen((o) => !o)}
        >
          <MenuIcon />
        </button>
        {view && (
          <>
            <span className="app-name">{view.clientName}</span>
            <span className="app-grant">{view.grantRound}</span>
          </>
        )}
      </header>

      <Drawer
        open={drawerOpen}
        applications={applications}
        currentId={view?.id ?? null}
        grants={grantChoices}
        onClose={closeDrawer}
        onOpenApplication={(id) => void openApplication(id)}
        onCreate={createApplication}
        // Export is wired in WP-3 (clean copy, F-15).
        onExport={() => closeDrawer()}
        onSettings={() => {
          setDrawerOpen(false);
          setSettingsOpen(true);
        }}
      />

      {settingsOpen ? (
        <Settings
          client={client}
          data={settings}
          hasKey={hasKey}
          saveKey={saveKey}
          onClose={() => {
            setSettingsOpen(false);
            menuButton.current?.focus();
          }}
        />
      ) : view ? (
        <div
          className="workspace"
          style={gridStyle}
          data-resizing={resizing || undefined}
          data-sliding={sliding || undefined}
          data-testid="workspace"
        >
          <div className="panel-wrap left-wrap" data-open={layout.leftOpen} inert={!layout.leftOpen}>
            <LeftPanel
              view={view}
              selected={selected}
              sections={layout.sections}
              onToggleSection={toggleSection}
              onSelect={setSelected}
              onCollapse={() => setPanel("left", false)}
            />
          </div>
          <Centre
            item={findItem(view, selected)}
            applicationId={view.id}
            client={client}
            leftOpen={layout.leftOpen}
            rightOpen={layout.rightOpen}
            onOpenLeft={() => setPanel("left", true)}
            onOpenRight={() => setPanel("right", true)}
          />
          <div className="panel-wrap right-wrap" data-open={layout.rightOpen} inert={!layout.rightOpen}>
            <RightPanel
              view={view}
              progress={null}
              selectedIssue={selectedIssue}
              onSelectIssue={setSelectedIssue}
              chatChoices={settings.chatChoices}
              onCollapse={() => setPanel("right", false)}
            />
          </div>
          {layout.leftOpen && !sliding && (
            <ResizeHandle side="left" width={leftWidth} label="Resize left panel" onResize={resize("left")} />
          )}
          {layout.rightOpen && !sliding && (
            <ResizeHandle side="right" width={rightWidth} label="Resize right panel" onResize={resize("right")} />
          )}
        </div>
      ) : (
        <main className="empty" data-testid="empty">
          <button type="button" className="button" onClick={() => setDrawerOpen(true)}>
            New application
          </button>
        </main>
      )}
    </div>
  );
}

function grantShort(grants: GrantManifest[], packageId: string): string {
  return grants.find((g) => g.id === packageId)?.grant ?? packageId;
}
