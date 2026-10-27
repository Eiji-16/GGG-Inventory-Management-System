/* ==========================================================================
   SLIDING TAB HIGHLIGHT
   --------------------------------------------------------------------------
   Every tab group in the system is marked with role="tablist" and its active
   tab with aria-selected="true" (or the "is-active"/"active" class). This
   helper adds one highlight behind the active tab and slides it to the newly
   selected tab, instead of the colour jumping instantly.

   - Works on all existing and future tab groups automatically (nothing to
     change in the screens).
   - Copies the active tab's own background colour, corner radius and shadow,
     so each tab group keeps its look and follows the light/dark theme.
   - Purely visual: clicks, keyboard use and what the tabs do are unchanged.
   ========================================================================== */

const ACTIVE = '[role="tab"][aria-selected="true"], [role="tab"].is-active, [role="tab"].active';
const attached = new WeakMap();

function readActiveLook(tablist, active) {
    // Read the tab's real look with the slider turned off for a moment. This
    // all happens before the browser paints, so nothing flickers.
    // The tab's own colour transition is paused too, so we read its final
    // colour, not a half-faded one.
    const previousTransition = active.style.transition;
    active.style.transition = 'none';
    tablist.classList.remove('ui-has-slider');
    const style = getComputedStyle(active);
    const look = {
        background: style.backgroundColor,
        image: style.backgroundImage,
        radius: style.borderRadius,
        shadow: style.boxShadow,
    };
    tablist.classList.add('ui-has-slider');
    void active.offsetWidth; // apply the change before turning transitions back on
    active.style.transition = previousTransition;
    return look;
}

function attach(tablist) {
    if (attached.has(tablist)) return;
    if (getComputedStyle(tablist).position === 'static') tablist.style.position = 'relative';

    const slider = document.createElement('span');
    slider.className = 'ui-tab-slider no-anim';
    slider.setAttribute('aria-hidden', 'true');
    tablist.prepend(slider);

    const update = () => {
        const active = tablist.querySelector(ACTIVE);
        if (!active || active.offsetParent === null || active.offsetWidth === 0) {
            slider.classList.remove('is-ready');
            tablist.classList.remove('ui-has-slider');
            return;
        }
        const look = readActiveLook(tablist, active);
        // A tab with no background of its own (text-only tabs) gets no slider.
        const transparent = /rgba\(0, 0, 0, 0\)|transparent/.test(look.background) && look.image === 'none';
        if (transparent) {
            slider.classList.remove('is-ready');
            tablist.classList.remove('ui-has-slider');
            return;
        }
        slider.style.width = `${active.offsetWidth}px`;
        slider.style.height = `${active.offsetHeight}px`;
        slider.style.transform = `translate(${active.offsetLeft}px, ${active.offsetTop}px)`;
        slider.style.backgroundColor = look.background;
        slider.style.backgroundImage = look.image;
        slider.style.borderRadius = look.radius;
        slider.style.boxShadow = look.shadow;
        slider.classList.add('is-ready');
        // First placement is instant; after that every change slides.
        if (slider.classList.contains('no-anim')) {
            requestAnimationFrame(() => slider.classList.remove('no-anim'));
        }
    };

    let queued = false;
    const schedule = () => {
        if (queued) return;
        queued = true;
        requestAnimationFrame(() => { queued = false; update(); });
    };

    // Ignore the helper's own changes (its class on the tab group and the
    // slider), otherwise it would keep re-triggering itself.
    const changes = new MutationObserver((records) => {
        if (records.some((record) => record.target !== tablist && record.target !== slider)) schedule();
    });
    changes.observe(tablist, { subtree: true, attributes: true, attributeFilter: ['aria-selected', 'class', 'disabled'], childList: true });
    const resize = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null;
    resize?.observe(tablist);

    attached.set(tablist, { update, schedule });
    schedule();
}

let started = false;

/** Call once when the app starts. */
export function startSlidingTabs() {
    if (started || typeof document === 'undefined') return;
    started = true;

    const scan = (root) => {
        if (root.nodeType !== 1) return;
        if (root.matches?.('[role="tablist"]')) attach(root);
        root.querySelectorAll?.('[role="tablist"]').forEach(attach);
    };
    scan(document.body);

    // Tab groups that appear later (other pages, pop-ups) are picked up too.
    new MutationObserver((records) => {
        records.forEach((record) => record.addedNodes.forEach(scan));
    }).observe(document.body, { childList: true, subtree: true });

    // Theme change or window resize: re-measure every tab group.
    const refreshAll = () => document.querySelectorAll('[role="tablist"]').forEach((list) => attached.get(list)?.schedule());
    window.addEventListener('resize', refreshAll);
    new MutationObserver(refreshAll).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    // A hidden page becoming visible needs measuring once it shows.
    document.addEventListener('click', () => requestAnimationFrame(refreshAll), true);
}
