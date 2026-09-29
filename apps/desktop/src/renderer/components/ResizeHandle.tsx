// Drag handle on a side panel's inner edge. Also a keyboard separator (F-01 AC4): arrow keys
// move it 16 px, Home/End jump to the limits.
import { useRef, type KeyboardEvent, type PointerEvent } from "react";
import { PANEL_MAX, PANEL_MIN, clampWidth } from "../state/layout";

interface Props {
  side: "left" | "right";
  width: number;
  label: string;
  /** Called while dragging (live) and once at the end (live = false). */
  onResize: (width: number, live: boolean) => void;
}

const STEP = 16;

export function ResizeHandle({ side, width, label, onResize }: Props) {
  const drag = useRef<{ startX: number; startWidth: number; last: number } | null>(null);
  // Dragging right widens the left panel and narrows the right one.
  const sign = side === "left" ? 1 : -1;

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { startX: e.clientX, startWidth: width, last: width };
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const next = clampWidth(d.startWidth + sign * (e.clientX - d.startX));
    if (next !== d.last) {
      d.last = next;
      onResize(next, true);
    }
  };
  const end = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    onResize(d.last, false);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const grow = side === "left" ? "ArrowRight" : "ArrowLeft";
    const shrink = side === "left" ? "ArrowLeft" : "ArrowRight";
    let next: number | null = null;
    if (e.key === grow) next = width + STEP;
    else if (e.key === shrink) next = width - STEP;
    else if (e.key === "Home") next = PANEL_MIN;
    else if (e.key === "End") next = PANEL_MAX;
    if (next === null) return;
    e.preventDefault();
    onResize(clampWidth(next), false);
  };

  return (
    <div
      className={`resize-handle resize-${side}`}
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuemin={PANEL_MIN}
      aria-valuemax={PANEL_MAX}
      aria-valuenow={width}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
      onKeyDown={onKeyDown}
      data-testid={`resize-${side}`}
    />
  );
}
