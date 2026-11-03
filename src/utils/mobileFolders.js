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

/* ==========================================================================
   STICKING CARD LIST (masonry, 2026-11-03)
   When the cards are in 2 columns, a tall OPEN card used to leave a big
   empty gap beside it (both cards of a row shared one row height). Now the
   grid uses tiny 4px rows and every card spans as many as its own height
   needs, so the next card "sticks" right under the one above it in the same
   column. Works for every folder list (Products, Suppliers, Stock Control,
   History, Reorder List, Trash Bin) and re-measures when a card opens,
   closes or the screen size changes. One column (phones) = normal list.
   ========================================================================== */
const ROW = 4;      // px, must match grid-auto-rows in index.css
const GAP = 11;     // px between cards (≈ 0.7rem)

function layoutMasonry(tbody) {
  const style = getComputedStyle(tbody);
  const columns = style.display === 'grid'
    ? style.gridTemplateColumns.split(' ').filter(Boolean).length
    : 1;
  const rows = Array.from(tbody.children);
  if (columns < 2 || !window.matchMedia(QUERY).matches) {
    if (tbody.hasAttribute('data-masonry')) {
      tbody.removeAttribute('data-masonry');
      rows.forEach((row) => { row.style.gridRowEnd = ''; });
    }
    return;
  }
  tbody.setAttribute('data-masonry', '');
  rows.forEach((row) => {
    const span = Math.max(1, Math.ceil((row.offsetHeight + GAP) / ROW));
    if (row.style.gridRowEnd !== `span ${span}`) row.style.gridRowEnd = `span ${span}`;
  });
}

export function startStickingCards() {
  if (typeof window === 'undefined' || window.__stickingCardsStarted) return;
  window.__stickingCardsStarted = true;

  const queued = new Set();
  let frame = 0;
  const schedule = (tbody) => {
    if (tbody) queued.add(tbody);
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      const list = queued.size ? Array.from(queued) : Array.from(document.querySelectorAll('table.m-folders > tbody'));
      queued.clear();
      list.forEach((tbody) => { if (tbody.isConnected) layoutMasonry(tbody); });
    });
  };

  const sizes = typeof ResizeObserver !== 'undefined'
    ? new ResizeObserver((entries) => entries.forEach((entry) => schedule(entry.target.closest('tbody'))))
    : null;
  const watched = new WeakSet();
  const watch = () => {
    document.querySelectorAll('table.m-folders > tbody > tr').forEach((row) => {
      if (watched.has(row)) return;
      watched.add(row);
      sizes?.observe(row);
    });
  };

  new MutationObserver(() => { watch(); schedule(); })
    .observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-m-open', 'hidden'] });
  window.addEventListener('resize', () => schedule());
  watch();
  schedule();
}
