/* ===== ESC CLOSES POP-UPS (one for the whole system, 2026-11-18) =====
   Pressing Esc does the same as clicking outside the top pop-up. So every
   pop-up keeps its own rule:
     - pop-ups that close on an outside click now also close with Esc,
     - a pop-up that asks "Close without saving?" still asks,
     - a pop-up that is saving (busy) stays open,
     - sign-in steps that ignore outside clicks also ignore Esc.
   Pop-ups that already handle Esc themselves are not closed twice: this
   waits a moment and only acts if the same pop-up is still open.

   Started once in layouts/App.jsx with startEscapeCloses(). */
let started = false;

// Dark layers behind pop-ups. (Hover layers on photos are not pop-ups.)
const OVERLAY = '[class*="modal-overlay"], [class*="modal-backdrop"], .am-overlay, .logout-confirm-overlay, .s-sys-overlay, .sc-drawer-overlay';

const topOverlay = () => {
  const open = [...document.querySelectorAll(OVERLAY)].filter((el) => el.getClientRects().length > 0);
  return open[open.length - 1] || null;
};

export function startEscapeCloses() {
  if (started || typeof document === 'undefined') return;
  started = true;

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    // An open dropdown inside the pop-up closes first; the pop-up stays.
    if (document.querySelector('.cs-menu, .rows-picker-menu')) return;
    const overlay = topOverlay();
    if (!overlay) return;
    // Let the pop-up's own Esc handling (or an open dropdown) go first.
    window.setTimeout(() => {
      if (!overlay.isConnected || topOverlay() !== overlay) return;
      const options = { bubbles: true, cancelable: true, view: window };
      overlay.dispatchEvent(new MouseEvent('mousedown', options));
      overlay.dispatchEvent(new MouseEvent('mouseup', options));
      overlay.dispatchEvent(new MouseEvent('click', options));
    }, 0);
  });
}
