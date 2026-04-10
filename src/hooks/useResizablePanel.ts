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

  const onDragHandleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragStartX.current     = e.clientX;
      dragStartWidth.current = width;

      const onMouseMove = (ev: MouseEvent) => {
        if (dragStartX.current === null) return;
        const delta = dragStartX.current - ev.clientX;
        setWidth(Math.min(maxWidth, Math.max(minWidth, dragStartWidth.current + delta)));
      };

      const onMouseUp = () => {
        dragStartX.current = null;
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup",   onMouseUp);
      };

      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup",   onMouseUp);
    },
    [width, minWidth, maxWidth, setWidth],
  );

  return { width, onDragHandleMouseDown };
}
