import { describe, expect, it } from "vitest";
import { DEFAULT_LAYOUT, PANEL_MAX, PANEL_MIN, clampWidth, fitWidths, parseLayout } from "./layout";

describe("layout prefs", () => {
  it("defaults open Deliverables, Source documents and References only", () => {
    expect(parseLayout(null).sections).toEqual({
      grant: false,
      workflow: false,
      deliverables: true,
      sources: true,
      references: true,
    });
  });

  it("clamps widths to 220–480 px", () => {
    expect(clampWidth(100)).toBe(PANEL_MIN);
    expect(clampWidth(900)).toBe(PANEL_MAX);
    expect(clampWidth(300.4)).toBe(300);
    expect(clampWidth(Number.NaN)).toBe(PANEL_MIN);
  });

  it("restores stored values and falls back field by field", () => {
    const stored = JSON.stringify({ leftWidth: 999, rightOpen: false, sections: { grant: true, sources: "x" } });
    const prefs = parseLayout(stored);
    expect(prefs.leftWidth).toBe(PANEL_MAX);
    expect(prefs.rightWidth).toBe(DEFAULT_LAYOUT.rightWidth);
    expect(prefs.rightOpen).toBe(false);
    expect(prefs.leftOpen).toBe(true);
    expect(prefs.sections.grant).toBe(true);
    expect(prefs.sections.sources).toBe(true);
  });

  it("ignores corrupt storage", () => {
    expect(parseLayout("{not json")).toEqual(DEFAULT_LAYOUT);
    expect(parseLayout("42")).toEqual(DEFAULT_LAYOUT);
  });
});

describe("fitWidths", () => {
  const prefs = { ...DEFAULT_LAYOUT, leftWidth: 480, rightWidth: 480 };
  it("keeps preferences when they fit", () => {
    expect(fitWidths(prefs, 1440)).toEqual({ left: 480, right: 480 });
  });
  it("narrows the right panel first, then the left, keeping the centre at 360 px", () => {
    expect(fitWidths(prefs, 1200)).toEqual({ left: 480, right: 360 });
    expect(fitWidths(prefs, 960)).toEqual({ left: 380, right: 220 });
  });
  it("ignores a collapsed panel", () => {
    expect(fitWidths({ ...prefs, rightOpen: false }, 800)).toEqual({ left: 440, right: 480 });
  });
});
