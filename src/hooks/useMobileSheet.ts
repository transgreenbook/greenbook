import { useState, useRef, useCallback } from "react";

interface Options {
  collapsedHeight: number;   // px — matches the Tailwind h-* class used when collapsed
  expandedRatio?:  number;   // fraction of window height when snapped open (default 0.70)
  snapThreshold?:  number;   // fraction of window height above which we snap open (default 0.30)
}

/**
 * Manages the height of a mobile bottom-sheet panel.
 *
 * - Tap the drag handle → toggle open/closed (same as clicking the header)
 * - Drag the handle     → free resize; snaps open or closed on release
 *
 * Usage:
 *   const { isExpanded, sheetStyle, isDragging, toggle, handleProps } =
 *     useMobileSheet({ collapsedHeight: 64 });
 *
 *   // outer sheet div:
 *   <div style={sheetStyle} className={isDragging ? "..." : isExpanded ? "h-[70vh]" : "h-16"}>
 *
 *   // drag handle pill:
 *   <div {...handleProps} />
 */
export function useMobileSheet({
  collapsedHeight,
  expandedRatio  = 0.70,
  snapThreshold  = 0.30,
}: Options) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [dragHeight, setDragHeight] = useState<number | null>(null);

  // Track drag start state across touch events
  const dragStartRef = useRef<{ y: number; h: number } | null>(null);
  // Set to true when we actually moved — suppresses the subsequent click event
  const didDragRef   = useRef(false);

  const getExpandedHeight = () => window.innerHeight * expandedRatio;

  /** Called by the header onClick — skipped if the gesture was a drag. */
  const toggle = useCallback(() => {
    if (didDragRef.current) {
      didDragRef.current = false;
      return;
    }
    setIsExpanded((v) => !v);
  }, []);

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      didDragRef.current = false;
      const currentH = isExpanded ? getExpandedHeight() : collapsedHeight;
      dragStartRef.current = { y: e.touches[0].clientY, h: currentH };
    },
    [isExpanded, collapsedHeight], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!dragStartRef.current) return;
      const delta = dragStartRef.current.y - e.touches[0].clientY;
      // Small deadzone so accidental micro-movements don't start a drag
      if (Math.abs(delta) < 6 && !didDragRef.current) return;
      didDragRef.current = true;
      const newH = Math.min(
        window.innerHeight * 0.90,
        Math.max(collapsedHeight, dragStartRef.current.h + delta),
      );
      setDragHeight(newH);
    },
    [collapsedHeight],
  );

  const onTouchEnd = useCallback(() => {
    dragStartRef.current = null;
    if (dragHeight !== null) {
      setIsExpanded(dragHeight > window.innerHeight * snapThreshold);
    }
    setDragHeight(null);
  }, [dragHeight, snapThreshold]);

  return {
    isExpanded,
    setIsExpanded,
    /** True while the user is actively dragging */
    isDragging: dragHeight !== null,
    /** Apply to the outer sheet div as style prop when isDragging */
    sheetStyle: dragHeight !== null ? { height: dragHeight } : undefined,
    toggle,
    /** Spread onto the drag-handle pill element */
    handleProps: { onTouchStart, onTouchMove, onTouchEnd },
  };
}
