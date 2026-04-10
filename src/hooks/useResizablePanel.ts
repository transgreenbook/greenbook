import { useCallback, useRef, useState } from "react";

interface Options {
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
}

/**
 * Provides width state and a mousedown handler for a left-edge drag handle
 * on a right-anchored sidebar panel.
 *
 * Dragging left increases width, dragging right decreases it.
 */
export function useResizablePanel({
  defaultWidth = 320,
  minWidth     = 240,
  maxWidth     = 700,
}: Options = {}) {
  const [width, setWidth]      = useState(defaultWidth);
  const dragStartX             = useRef<number | null>(null);
  const dragStartWidth         = useRef<number>(defaultWidth);

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
    [width, minWidth, maxWidth],
  );

  return { width, onDragHandleMouseDown };
}
