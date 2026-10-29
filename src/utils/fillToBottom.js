import { useCallback, useRef } from 'react';
import { uiZoom } from '../fontSize';

/* ===== FILL TO BOTTOM =====
   Makes a table box stretch down to the bottom of the page area, so there is
   no empty space under the page (the table still scrolls inside when there
   are many rows).

   How it works (measured, not guessed):
   1. Find the page area (.main-content-window) and the page inside it.
   2. Measure how much empty space is left between the bottom of the page and
      the bottom of the page area.
   3. Make the table box taller (or shorter) by exactly that amount, leaving
      a tiny gap (4px). Because it measures the real leftover space, every bit of
      padding, the page buttons and any banner are already accounted for.
   It re-measures when the window is resized or anything on the page changes
   size (a banner appears, the page buttons show up, data loads).

   shrink: true = the box is only as tall as its rows, but never past the
   bottom of the page (for short lists like Suppliers, so no empty space
   inside the box).

   Phones (900px wide or less) keep their normal card list, so nothing is
   changed there. */
const DESKTOP = '(min-width: 901px)';
const MIN_HEIGHT = 200;

export default function useFillToBottom(gap = 4, { shrink = false } = {}) {
  const cleanupRef = useRef(null);

  return useCallback((element) => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    if (!element || typeof window === 'undefined') return;

    const area = element.closest('.main-content-window');
    // The page = the child of the page area that holds this table.
    let page = element;
    while (page && page.parentElement && page.parentElement !== area) page = page.parentElement;

    let frame = 0;
    const apply = () => {
      frame = 0;
      // Hidden page (another menu is open) or phone layout: leave it alone.
      if (!area || !page || element.offsetParent === null || !window.matchMedia(DESKTOP).matches) {
        element.style.height = '';
        element.style.minHeight = '';
        element.style.maxHeight = '';
        return;
      }
      // On-screen sizes are scaled by Settings → Font size; turn them back
      // into page pixels so they match clientHeight and the px we set.
      const zoom = uiZoom();
      const areaBox = area.getBoundingClientRect();
      // Inside height of the page area (without its bottom padding).
      const areaInside = area.clientHeight - parseFloat(window.getComputedStyle(area).paddingBottom || 0);
      // Where the page ends, measured from the top of the page area's content
      // (the same whether or not the page area is scrolled).
      const pageBottom = (page.getBoundingClientRect().bottom - areaBox.top) / zoom
        + parseFloat(window.getComputedStyle(page).marginBottom || 0)
        - area.clientTop + area.scrollTop;
      const leftover = areaInside - pageBottom;              // empty space under the page
      const current = element.getBoundingClientRect().height / zoom;
      const target = Math.max(MIN_HEIGHT, Math.floor(current + leftover - gap));

      if (shrink) {
        // As tall as its rows, but never past the bottom of the page.
        if (Math.abs((parseFloat(element.style.maxHeight) || 0) - target) >= 1) {
          element.style.height = '';
          element.style.minHeight = '0';   // no forced minimum: a 1-row page is 1 row tall
          element.style.maxHeight = `${target}px`;
          element.dispatchEvent(new CustomEvent('fill-resize'));   // tells useRowsThatFit
        }
      } else if (Math.abs(current - target) >= 1) {
        element.style.height = `${target}px`;
        element.style.maxHeight = 'none';
        element.dispatchEvent(new CustomEvent('fill-resize'));     // tells useRowsThatFit
      }
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(apply);
    };

    schedule();
    window.addEventListener('resize', schedule);
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null;
    if (observer) {
      if (area) observer.observe(area);
      // The page changes size when a banner, the page buttons or rows appear.
      if (page && page !== element) observer.observe(page);
      if (element.parentElement) observer.observe(element.parentElement);
    }

    cleanupRef.current = () => {
      window.removeEventListener('resize', schedule);
      observer?.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [gap, shrink]);
}
