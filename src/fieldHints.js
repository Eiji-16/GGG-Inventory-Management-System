/* ==========================================================================
   Field descriptions preference
   The small helper notes under inputs (e.g. "About 20–25% of the unit cost
   per year") can be hidden from Settings. The choice is saved in this browser
   and applied as <html data-field-hints="shown|hidden">; the CSS rule that
   hides them lives in styles/index.css.
   ========================================================================== */

const STORAGE_KEY = 'ggg-field-hints';

export function readShowFieldHints() {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'hidden';
  } catch {
    return true;
  }
}

export function applyShowFieldHints(show) {
  document.documentElement.setAttribute('data-field-hints', show ? 'shown' : 'hidden');
}

export function saveShowFieldHints(show) {
  try {
    localStorage.setItem(STORAGE_KEY, show ? 'shown' : 'hidden');
  } catch {
    /* storage blocked — the choice still applies for this visit */
  }
  applyShowFieldHints(show);
}
