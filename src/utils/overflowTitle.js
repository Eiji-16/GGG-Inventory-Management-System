/* ===== FULL TEXT ON HOVER (one for the whole system, 2026-11-18) =====
   Long names and notes are cut with "…" so they never fill the screen.
   When the mouse rests on text that is cut off, this shows the whole text
   in the browser's own hover box (the title attribute). Text that fits
   gets nothing. Elements that already have a title, or a chart data-tip,
   are left alone.

   Started once in layouts/App.jsx with startOverflowTitles(). */
let started = false;

const AUTO = 'data-auto-title';

// Cut off sideways ("…") or under a line limit (several lines then "…").
const isCut = (element) => (
  element.scrollWidth > element.clientWidth + 1
  || element.scrollHeight > element.clientHeight + 1
);

export function startOverflowTitles() {
  if (started || typeof document === 'undefined') return;
  started = true;

  document.addEventListener('mouseover', (event) => {
    let element = event.target instanceof Element ? event.target : null;
    // The text may sit in the hovered element or a parent a few levels up.
    for (let depth = 0; element && depth < 4; depth += 1, element = element.parentElement) {
      if (element.hasAttribute('data-tip')) return;
      const auto = element.hasAttribute(AUTO);
      if (element.hasAttribute('title') && !auto) return;
      const style = window.getComputedStyle(element);
      const clips = style.textOverflow === 'ellipsis' || style.webkitLineClamp !== 'none';
      if (!clips) continue;
      const text = (element.textContent || '').replace(/\s+/g, ' ').trim();
      if (text && isCut(element)) {
        element.setAttribute('title', text);
        element.setAttribute(AUTO, '');
      } else if (auto) {
        // It fits now (wider window): stop showing the hover box.
        element.removeAttribute('title');
        element.removeAttribute(AUTO);
      }
      return;
    }
  }, { passive: true });
}
