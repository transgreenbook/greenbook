import { useCallback, useRef, useState } from "react";

interface Options {
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  /** If provided, the hook operates in controlled mode — width is read from
   *  this value and written via onChange instead of using internal state. */
  value?: number;
  onChange?: (width: number) => void;
}

/**
 * Provides width state and a mousedown handler for a left-edge drag handle
 * on a right-anchored sidebar panel.
 *
 * Dragging left increases width, dragging right decreases it.
 *
 * Pass `value` + `onChange` to operate in controlled mode (e.g. persisting
 * width in a store so it survives component unmounts).
 */
export function useResizablePanel({
  defaultWidth = 320,
  minWidth     = 240,
  maxWidth     = 700,
  value,
  onChange,
}: Options = {}) {
  const [internalWidth, setInternalWidth] = useState(defaultWidth);
  const width    = value !== undefined ? value : internalWidth;
  const setWidth = onChange ?? setInternalWidth;

  const dragStartX     = useRef<number | null>(null);
  const dragStartWidth = useRef<number>(width);

  const startDrag = useCallback(
    (startX: number) => {
      dragStartX.current     = startX;
      dragStartWidth.current = width;

      const onMouseMove = (ev: MouseEvent) => {
        if (dragStartX.current === null) return;
        const delta = dragStartX.current - ev.clientX;
        setWidth(Math.min(maxWidth, Math.max(minWidth, dragStartWidth.current + delta)));
      };

      const onTouchMove = (ev: TouchEvent) => {
        if (dragStartX.current === null) return;
        const delta = dragStartX.current - ev.touches[0].clientX;
        setWidth(Math.min(maxWidth, Math.max(minWidth, dragStartWidth.current + delta)));
      };

      const onEnd = () => {
        dragStartX.current = null;
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup",   onEnd);
        window.removeEventListener("touchmove", onTouchMove);
        window.removeEventListener("touchend",  onEnd);
      };

      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup",   onEnd);
      window.addEventListener("touchmove", onTouchMove, { passive: true });
      window.addEventListener("touchend",  onEnd);
    },
    [width, minWidth, maxWidth, setWidth],
  );

  const onDragHandleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      startDrag(e.clientX);
    },
    [startDrag],
  );

  const onDragHandleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      startDrag(e.touches[0].clientX);
    },
    [startDrag],
  );

  return { width, onDragHandleMouseDown, onDragHandleTouchStart };
}
