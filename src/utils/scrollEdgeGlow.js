import { uiZoom } from '../fontSize';

/* ==========================================================================
   SCROLL EDGE GLOW
   When you keep scrolling at the very top or the very bottom of a scrolling
   panel, a small soft light in the accent colour appears along that edge for
   a moment, to show the end has been reached.

   - Only for the panels listed in PANELS (the page area, tables, lists,
     pop-up bodies and menus) — never the whole window.
   - The light is a separate layer drawn on top of the panel's edge (it never
     changes the panel, its size, or how scrolling works) and lets clicks
     through.
   - Works with the mouse wheel / trackpad and with touch.
   - "Reduce motion": the light still shows, without the fade.
   Started once from src/layouts/App.jsx.
   ========================================================================== */

const PANELS = [
  '.main-content-window',
  '[class*="table-scroll"]',
  '.db-order-list',
  '.notif-box',
  '[role="listbox"]',
  '[role="menu"]',
  '[class*="modal-body"]',
  '[class*="modal-content"]',
].join(', ');

const SHOW_MS = 520;      // how long the light stays before fading
const REPEAT_MS = 450;    // at most one new light per edge in this time

let started = false;
const layers = { top: null, bottom: null };
const lastShown = new WeakMap();   // panel → { edge, at }

function canScroll(element) {
  if (!(element instanceof Element)) return false;
  if (element.scrollHeight <= element.clientHeight + 1) return false;
  const overflow = window.getComputedStyle(element).overflowY;
  return overflow === 'auto' || overflow === 'scroll';
}

/* The closest listed panel around the pointer that can actually scroll. */
function panelFor(target) {
  let node = target instanceof Element ? target : null;
  while (node) {
    const panel = node.closest(PANELS);
    if (!panel) return null;
    if (canScroll(panel)) return panel;
    node = panel.parentElement;
  }
  return null;
}

function atEdge(panel, edge) {
  if (edge === 'top') return panel.scrollTop <= 0;
  return Math.ceil(panel.scrollTop + panel.clientHeight) >= panel.scrollHeight - 1;
}

function layer(edge) {
  if (!layers[edge]) {
    const el = document.createElement('div');
    el.className = `ui-edge-glow is-${edge}`;
    el.setAttribute('aria-hidden', 'true');
    document.body.appendChild(el);
    layers[edge] = el;
  }
  return layers[edge];
}

function show(panel, edge) {
  const now = performance.now();
  const last = lastShown.get(panel);
  if (last && last.edge === edge && now - last.at < REPEAT_MS) return;
  lastShown.set(panel, { edge, at: now });

  const rect = panel.getBoundingClientRect();
  if (rect.width < 40 || rect.height < 40) return;
  // Screen sizes are divided by the font-size zoom (the layer lives in the zoomed page).
  const zoom = uiZoom();
  const el = layer(edge);
  el.style.left = `${rect.left / zoom}px`;
  el.style.width = `${rect.width / zoom}px`;
  el.style.top = edge === 'top'
    ? `${rect.top / zoom}px`
    : `${(rect.bottom / zoom) - el.offsetHeight}px`;

  el.classList.remove('is-on');
  // Restart the fade-in when the light shows again.
  void el.offsetWidth;
  el.classList.add('is-on');
  window.clearTimeout(el.hideTimer);
  el.hideTimer = window.setTimeout(() => el.classList.remove('is-on'), SHOW_MS);
}

function onWheel(event) {
  if (Math.abs(event.deltaY) < Math.abs(event.deltaX) || event.deltaY === 0) return;
  const panel = panelFor(event.target);
  if (!panel) return;
  const edge = event.deltaY < 0 ? 'top' : 'bottom';
  if (atEdge(panel, edge)) show(panel, edge);
}

let touchY = null;
function onTouchStart(event) { touchY = event.touches[0]?.clientY ?? null; }
function onTouchMove(event) {
  if (touchY === null) return;
  const y = event.touches[0]?.clientY;
  if (y == null || Math.abs(y - touchY) < 12) return;
  const panel = panelFor(event.target);
  // Finger moving down = trying to scroll up past the top.
  const edge = y > touchY ? 'top' : 'bottom';
  touchY = y;
  if (panel && atEdge(panel, edge)) show(panel, edge);
}

export function startScrollEdgeGlow() {
  if (started || typeof window === 'undefined') return;
  started = true;
  window.addEventListener('wheel', onWheel, { passive: true });
  window.addEventListener('touchstart', onTouchStart, { passive: true });
  window.addEventListener('touchmove', onTouchMove, { passive: true });
}

export default startScrollEdgeGlow;
