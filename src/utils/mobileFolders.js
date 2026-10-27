/* ==========================================================================
   MOBILE "FOLDER" CARDS
   On phones/tablets (≤ 900px) the data lists show each row as a card. A card
   with a .m-title cell starts closed: it shows only its title (plus the
   checkbox .m-keep and one short .m-peek detail). Tapping the card opens it
   to show every detail and the Edit / Delete buttons; tapping the title
   again closes it.

   A table opts in with className="... m-folders" and these cell classes:
     m-title  the headline (product / supplier name)
     m-keep   always visible (the checkbox)
     m-peek   one short detail shown under the title while closed
   The open state is a data attribute on the <tr>, so React re-renders keep it.
   ========================================================================== */

const QUERY = '(max-width: 900px)';
const INTERACTIVE = 'input, button, a, select, textarea, label, [role="button"]';

export function startMobileFolders() {
  if (typeof window === 'undefined' || window.__mobileFoldersStarted) return;
  window.__mobileFoldersStarted = true;
  const media = window.matchMedia(QUERY);

  const toggle = (row, open) => {
    if (open) row.setAttribute('data-m-open', '');
    else row.removeAttribute('data-m-open');
    row.setAttribute('aria-expanded', open ? 'true' : 'false');
  };

  // Capture phase: decide before the row's own click handler (e.g. "open
  // product details") runs, so the first tap only opens the card.
  document.addEventListener('click', (event) => {
    if (!media.matches) return;
    const row = event.target.closest?.('table.m-folders > tbody > tr');
    if (!row || !row.querySelector(':scope > td.m-title')) return;
    if (event.target.closest('td.m-keep')) return; // the checkbox works as usual

    const isOpen = row.hasAttribute('data-m-open');
    if (!isOpen) {
      event.preventDefault();
      event.stopPropagation();
      toggle(row, true);
      return;
    }
    // Open card: buttons and links inside work normally; tapping the title
    // (anywhere that isn't a button) closes it again.
    if (event.target.closest(INTERACTIVE)) return;
    if (event.target.closest('td.m-title')) {
      event.preventDefault();
      event.stopPropagation();
      toggle(row, false);
    }
  }, true);
}
