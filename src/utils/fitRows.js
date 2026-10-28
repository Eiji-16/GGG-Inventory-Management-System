import { useEffect, useState } from 'react';

/* ===== ROWS THAT FIT =====
   Works out how many table rows fit inside a table box, so each page of the
   table fills the box (used with useFillToBottom, which gives the box its
   height).

   How:
   1. Measure one row at its normal height and the column-title row.
   2. Rows per page = (box height − title row) ÷ row height, rounded down.
   3. The little space left over (less than one row) is shared out between
      the rows, making each a few pixels taller, so a full page reaches the
      bottom of the box exactly — no empty "invisible row" under the last row.
   Re-measures when the window is resized, when useFillToBottom changes the
   box's height (event "fill-resize"), when the box's width changes, and
   whenever `deps` change (e.g. the table switched view or finished loading).

   Phones show cards instead of a table, so they get a fixed page size and
   normal row heights. */
const DESKTOP = '(min-width: 901px)';
const ROW_VAR = '--fit-row-height';

export default function useRowsThatFit(element, { min = 5, fallback = 20, deps = [] } = {}) {
  const [size, setSize] = useState(fallback);

  useEffect(() => {
    if (!element || typeof window === 'undefined') return undefined;
    let frame = 0;

    const measure = () => {
      frame = 0;
      if (element.offsetParent === null) return;          // page is hidden
      if (!window.matchMedia(DESKTOP).matches) {           // phone card layout
        element.style.removeProperty(ROW_VAR);
        delete element.dataset.fitRows;
        setSize((prev) => (prev === fallback ? prev : fallback));
        return;
      }
      // Measure at the normal row height (without the stretch from last time).
      element.style.removeProperty(ROW_VAR);
      // A normal data row (skip "Loading…" / "No rows" messages that span all columns).
      const row = Array.from(element.querySelectorAll('tbody tr'))
        .find((tr) => !tr.querySelector('td[colspan]') && !tr.classList.contains('ps-skeleton-row'));
      const rowHeight = row ? row.getBoundingClientRect().height : 0;
      if (!rowHeight) return;
      const headHeight = element.querySelector('thead')?.getBoundingClientRect().height || 0;
      // The box's full height: its height limit when it shrinks to its rows
      // (useFillToBottom shrink mode), otherwise its actual height.
      const limit = parseFloat(element.style.maxHeight);
      const boxHeight = Number.isFinite(limit) ? limit : element.clientHeight;
      const space = boxHeight - headHeight;
      const fits = Math.max(min, Math.floor(space / rowHeight));
      // Share the leftover space between the rows (only when they all fit).
      if (fits * rowHeight <= space) {
        element.style.setProperty(ROW_VAR, `${Math.floor((space / fits) * 100) / 100}px`);
        element.dataset.fitRows = 'true';
      } else {
        delete element.dataset.fitRows;
      }
      setSize((prev) => (prev === fits ? prev : fits));
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(measure);
    };

    schedule();
    window.addEventListener('resize', schedule);
    // useFillToBottom tells us when it changes the box's height limit.
    element.addEventListener('fill-resize', schedule);
    // Only a change of WIDTH re-measures here (it can change how rows wrap).
    // Height changes are ignored on purpose: measuring changes the box's
    // height for a moment, and reacting to that caused an endless flicker.
    let lastWidth = element.getBoundingClientRect().width;
    const observer = typeof ResizeObserver === 'function'
      ? new ResizeObserver(() => {
        const width = element.getBoundingClientRect().width;
        if (Math.abs(width - lastWidth) >= 1) {
          lastWidth = width;
          schedule();
        }
      })
      : null;
    observer?.observe(element);

    return () => {
      window.removeEventListener('resize', schedule);
      element.removeEventListener('fill-resize', schedule);
      observer?.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [element, min, fallback, ...deps]);

  return size;
}
