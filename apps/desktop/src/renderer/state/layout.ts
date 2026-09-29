// Layout preferences (F-01): side panel widths, open/closed state and open tree sections.
// Kept in the renderer's own storage (per-user app data), never in application folders; nothing
// here is client content. Single-user seam (§10.5): move behind settings when there are users.

export const PANEL_MIN = 220;
export const PANEL_MAX = 480;
/** The centre never gets narrower than this; side panels give way first (down to PANEL_MIN). */
export const CENTRE_MIN = 360;

export type SectionKey = "grant" | "workflow" | "deliverables" | "sources" | "references";

export interface LayoutPrefs {
  leftWidth: number;
  rightWidth: number;
  leftOpen: boolean;
  rightOpen: boolean;
  sections: Record<SectionKey, boolean>;
}

/** Defaults from spec 03 §2: only Deliverables, Source documents and References are open. */
export const DEFAULT_LAYOUT: LayoutPrefs = {
  leftWidth: 256,
  rightWidth: 380,
  leftOpen: true,
  rightOpen: true,
  sections: { grant: false, workflow: false, deliverables: true, sources: true, references: true },
};

const KEY = "gw.layout.v1";

export function clampWidth(width: number): number {
  if (!Number.isFinite(width)) return PANEL_MIN;
  return Math.round(Math.min(PANEL_MAX, Math.max(PANEL_MIN, width)));
}

/** Parses stored prefs, falling back field by field to the defaults. */
export function parseLayout(raw: string | null): LayoutPrefs {
  if (!raw) return DEFAULT_LAYOUT;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return DEFAULT_LAYOUT;
  }
  if (typeof data !== "object" || data === null) return DEFAULT_LAYOUT;
  const d = data as Partial<Record<keyof LayoutPrefs, unknown>>;
  const num = (v: unknown, fallback: number) => (typeof v === "number" ? clampWidth(v) : fallback);
  const bool = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);
  const s = (typeof d.sections === "object" && d.sections !== null ? d.sections : {}) as Partial<
    Record<SectionKey, unknown>
  >;
  const sections = { ...DEFAULT_LAYOUT.sections };
  for (const k of Object.keys(sections) as SectionKey[]) sections[k] = bool(s[k], sections[k]);
  return {
    leftWidth: num(d.leftWidth, DEFAULT_LAYOUT.leftWidth),
    rightWidth: num(d.rightWidth, DEFAULT_LAYOUT.rightWidth),
    leftOpen: bool(d.leftOpen, DEFAULT_LAYOUT.leftOpen),
    rightOpen: bool(d.rightOpen, DEFAULT_LAYOUT.rightOpen),
    sections,
  };
}

export function loadLayout(): LayoutPrefs {
  try {
    return parseLayout(window.localStorage.getItem(KEY));
  } catch {
    return DEFAULT_LAYOUT;
  }
}

export function saveLayout(prefs: LayoutPrefs): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // Storage unavailable: the layout still works, it just isn't remembered.
  }
}

/** Panel widths to show in a window `total` px wide: the right panel gives way first, then the left. */
export function fitWidths(prefs: LayoutPrefs, total: number): { left: number; right: number } {
  let left = prefs.leftWidth;
  let right = prefs.rightWidth;
  let excess = (prefs.leftOpen ? left : 0) + (prefs.rightOpen ? right : 0) + CENTRE_MIN - total;
  if (excess > 0 && prefs.rightOpen) {
    const give = Math.min(excess, right - PANEL_MIN);
    right -= give;
    excess -= give;
  }
  if (excess > 0 && prefs.leftOpen) left -= Math.min(excess, left - PANEL_MIN);
  return { left, right };
}
