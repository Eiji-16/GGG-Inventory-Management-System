/* ==========================================================================
   SLIDING SIDEBAR HIGHLIGHT
   --------------------------------------------------------------------------
   The highlight behind the open page used to jump from one item to the next.
   Now there is ONE highlight per sidebar group (the page list, and the
   Staffs … Setting group) that slides to the newly opened page — the same
   idea as the sliding tab highlight (utils/slidingTabs.js).

   - Icons only: the highlight copies the open item's own pill (colour,
     corners, shadow), so every theme keeps its look.
   - With names: the soft highlight + accent line (look set in motion.css).
   - Moving to the other group: the old group's highlight fades out and the
     new one fades in at its place.
   - Purely visual: clicks, keyboard use and navigation are unchanged.
   - Phones (≤ 820 px, slide-in menu) keep the normal highlight.
   - "Reduce motion": it moves without sliding.
   Started once from src/layouts/App.jsx.
   ========================================================================== */

const GROUPS = [
  { container: '.sidebar-menu', active: ':scope > .sidebar-item.active > button' },
  { container: '.sub-sidebar-footer-item', active: ':scope > .siderbar-item.active > button' },
];
const DESKTOP = '(min-width: 821px)';
const attached = new WeakSet();
let started = false;

function readPillLook(container, button) {
  // Read the item's real pill with the slider switched off for a moment
  // (before the browser paints, so nothing flickers).
  const previous = button.style.transition;
  button.style.transition = 'none';
  container.classList.remove('ui-nav-has-slider');
  const style = getComputedStyle(button);
  const look = {
    background: style.backgroundColor,
    image: style.backgroundImage,
    radius: style.borderRadius,
    shadow: style.boxShadow,
  };
  container.classList.add('ui-nav-has-slider');
  void button.offsetWidth; // apply before turning transitions back on
  button.style.transition = previous;
  return look;
}

function attachGroup(aside, group) {
  const container = aside.querySelector(group.container);
  if (!container || attached.has(container)) return null;
  attached.add(container);
  if (getComputedStyle(container).position === 'static') container.style.position = 'relative';

  const slider = document.createElement('span');
  slider.className = 'ui-nav-slider no-anim';
  slider.setAttribute('aria-hidden', 'true');
  container.prepend(slider);

  let lastMode = null;
  const hide = () => {
    slider.classList.remove('is-ready');
    container.classList.remove('ui-nav-has-slider');
  };

  const update = () => {
    if (!window.matchMedia(DESKTOP).matches) { hide(); return; }
    const button = container.querySelector(group.active);
    if (!button || button.offsetParent === null) { hide(); return; }

    const expanded = aside.classList.contains('is-expanded');
    const mode = expanded ? 'names' : 'icons';
    // Switching Icons ↔ Names, or appearing in this group: jump, don't slide.
    if (mode !== lastMode || !slider.classList.contains('is-ready')) slider.classList.add('no-anim');
    lastMode = mode;

    // Position inside the (possibly scrolled, possibly zoomed) group.
    const box = container.getBoundingClientRect();
    const rect = button.getBoundingClientRect();
    const scale = container.offsetWidth ? box.width / container.offsetWidth : 1;
    const left = (rect.left - box.left) / scale + container.scrollLeft - container.clientLeft;
    const top = (rect.top - box.top) / scale + container.scrollTop - container.clientTop;

    slider.classList.toggle('is-names', expanded);
    if (expanded) {
      slider.style.background = '';
      slider.style.borderRadius = '';
      slider.style.boxShadow = '';
      container.classList.add('ui-nav-has-slider');
    } else {
      const look = readPillLook(container, button);
      slider.style.background = look.image !== 'none' ? `${look.image}, ${look.background}` : look.background;
      slider.style.borderRadius = look.radius;
      slider.style.boxShadow = look.shadow;
    }
    slider.style.width = `${rect.width / scale}px`;
    slider.style.height = `${rect.height / scale}px`;
    slider.style.transform = `translate(${left}px, ${top}px)`;
    slider.classList.add('is-ready');
    if (slider.classList.contains('no-anim')) {
      requestAnimationFrame(() => requestAnimationFrame(() => slider.classList.remove('no-anim')));
    }
  };

  return update;
}

function attachAside(aside) {
  if (attached.has(aside)) return;
  attached.add(aside);
  const updates = GROUPS.map((group) => attachGroup(aside, group)).filter(Boolean);
  let queued = false;
  const schedule = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; updates.forEach((update) => update()); });
  };
  // A different page opened (class "active" moved) or the sidebar changed mode.
  // Only those changes count — the slider's own class changes are ignored,
  // otherwise it would keep re-triggering itself.
  new MutationObserver((records) => {
    if (records.some((record) => record.target === aside
      || record.target.classList?.contains('sidebar-item')
      || record.target.classList?.contains('siderbar-item'))) schedule();
  }).observe(aside, { attributes: true, attributeFilter: ['class'], subtree: true });
  // Width animation (Icons ↔ Names), window size, font size.
  aside.addEventListener('transitionend', schedule);
  window.addEventListener('resize', schedule);
  if (typeof ResizeObserver !== 'undefined') {
    const resize = new ResizeObserver(schedule);
    resize.observe(aside);
  }
  schedule();
}

export function startSidebarSlider() {
  if (started || typeof window === 'undefined' || typeof MutationObserver === 'undefined') return;
  if (!document.body) {
    document.addEventListener('DOMContentLoaded', startSidebarSlider, { once: true });
    return;
  }
  started = true;
  const find = () => document.querySelectorAll('.sidebar-body').forEach(attachAside);
  // The sidebar appears after signing in (and again after signing in once more).
  new MutationObserver(find).observe(document.body, { childList: true, subtree: true });
  find();
}

export default startSidebarSlider;
