/* ==========================================================================
   SMOOTH CLOSING (pop-ups, confirmations, menus, notifications)
   --------------------------------------------------------------------------
   Pop-ups already fade in when they open (motion.css), but React removes
   them from the page the moment they close, so they used to vanish at once.

   This helper watches for those elements being removed. When one goes, a
   copy of it is put back in the same place for a moment and fades out
   (pop-ups and their backdrop: fade + slight sink; menus: fade + slide up —
   the dropdown's opening movement played backwards). The copy:
     - cannot be clicked, typed in or focused (inert), so the real screen
       underneath works immediately;
     - keeps what was typed in its fields, so it does not flash empty;
     - is removed as soon as its fade ends (about 0.16 s).
   Nothing in the screens' code changes; what they do is exactly the same.
   "Reduce motion" in the device settings: no copy, they close at once.
   Started once from src/layouts/App.jsx.
   ========================================================================== */

// Pop-ups and their backdrops.
const POPUPS = [
  '[class*="modal-overlay"]',
  '[class*="-overlay"]',
  '[class*="modal-backdrop"]',
  '.sidebar-backdrop',
  '[role="dialog"]',
  '[role="alertdialog"]',
].join(', ');
// Menus and drop-down lists (same family as the reference dropdown).
const MENUS = [
  '[role="listbox"]',
  '[role="menu"]',
  '.notif-box',
  '.search-suggest-menu',
  '[class*="sort-menu"]',
].join(', ');
// Never animate these (they have their own show/hide, or are not pop-ups).
const SKIP = '.chart-tip, .ui-edge-glow, .ui-leaving, [data-no-exit], tr, td, [class*="-card"]';

const LEAVE_MS = 220;   // safety net; the CSS fade itself is 140–160 ms
let started = false;

const reducedMotion = () => window.matchMedia
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* Copy what the person typed (cloneNode copies only the starting values). */
function copyFieldValues(from, to) {
  const source = from.querySelectorAll('input, textarea, select');
  const target = to.querySelectorAll('input, textarea, select');
  source.forEach((field, index) => {
    const copy = target[index];
    if (!copy) return;
    if (field.type === 'checkbox' || field.type === 'radio') copy.checked = field.checked;
    else if (field.type !== 'file') copy.value = field.value;
  });
}

function playExit(node, record, kind) {
  const parent = record.target;
  if (!parent || !parent.isConnected) return;    // its whole area closed (e.g. page change)

  const ghost = node.cloneNode(true);
  copyFieldValues(node, ghost);
  // No duplicate ids on the page, and the copy can't be reached by keyboard or screen readers.
  if (ghost.id) ghost.removeAttribute('id');
  ghost.querySelectorAll('[id]').forEach((element) => element.removeAttribute('id'));
  ghost.inert = true;
  ghost.setAttribute('aria-hidden', 'true');
  ghost.classList.add('ui-leaving', kind === 'menu' ? 'is-menu' : 'is-popup');

  const next = record.nextSibling && record.nextSibling.parentNode === parent ? record.nextSibling : null;
  parent.insertBefore(ghost, next);

  let done = false;
  const remove = () => {
    if (done) return;
    done = true;
    ghost.remove();
  };
  ghost.addEventListener('animationend', (event) => { if (event.target === ghost) remove(); });
  window.setTimeout(remove, LEAVE_MS);
}

function onMutations(records) {
  if (reducedMotion()) return;
  records.forEach((record) => {
    record.removedNodes.forEach((node) => {
      if (node.nodeType !== 1 || node.matches(SKIP)) return;
      if (node.matches(POPUPS)) playExit(node, record, 'popup');
      else if (node.matches(MENUS)) playExit(node, record, 'menu');
    });
  });
}

export function startExitAnimations() {
  if (started || typeof window === 'undefined' || typeof MutationObserver === 'undefined') return;
  if (!document.body) {
    document.addEventListener('DOMContentLoaded', startExitAnimations, { once: true });
    return;
  }
  started = true;
  new MutationObserver(onMutations).observe(document.body, { childList: true, subtree: true });
}

export default startExitAnimations;
