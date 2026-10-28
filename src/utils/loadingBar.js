/* ==========================================================================
   Global loading indicator
   --------------------------------------------------------------------------
   One thin bar at the top of the screen that shows whenever the system is
   waiting for the server (any fetch: loading a page, saving, deleting,
   exporting…), so every screen gets loading feedback without changing it.

   - Only appears if a request takes longer than 250 ms (no flicker on quick
     calls) and fades out when everything has finished.
   - The 5-second "has anything changed?" check and other background polls
     are ignored, so the bar doesn't blink on its own.
   - While a request is running, <html> gets data-loading="true" (used by
     motion.css for the wait cursor).
   Started once from src/layouts/App.jsx.
   ========================================================================== */

const QUIET_URLS = ['/api/data-version', '/api/restock-requests', '/auth/user'];
const SHOW_AFTER_MS = 250;

let started = false;

export function startLoadingBar() {
  if (started || typeof window === 'undefined' || typeof window.fetch !== 'function') return;
  if (!document.body) {
    document.addEventListener('DOMContentLoaded', startLoadingBar, { once: true });
    return;
  }
  started = true;

  const bar = document.createElement('div');
  bar.className = 'ui-loading-bar';
  bar.setAttribute('role', 'progressbar');
  bar.setAttribute('aria-label', 'Loading');
  bar.setAttribute('aria-hidden', 'true');
  document.body.appendChild(bar);

  let active = 0;
  let showTimer = null;
  let hideTimer = null;

  const show = () => {
    clearTimeout(hideTimer);
    bar.classList.remove('is-done');
    bar.classList.add('is-active');
    bar.setAttribute('aria-hidden', 'false');
    document.documentElement.setAttribute('data-loading', 'true');
  };
  const hide = () => {
    clearTimeout(showTimer);
    showTimer = null;
    document.documentElement.removeAttribute('data-loading');
    if (!bar.classList.contains('is-active')) return;
    bar.classList.add('is-done');
    hideTimer = setTimeout(() => {
      bar.classList.remove('is-active', 'is-done');
      bar.setAttribute('aria-hidden', 'true');
    }, 320);
  };

  const originalFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : (input?.url || '');
    if (QUIET_URLS.some((quiet) => url.includes(quiet))) return originalFetch(input, init);

    active += 1;
    if (active === 1 && !showTimer) showTimer = setTimeout(show, SHOW_AFTER_MS);
    const finish = () => {
      active = Math.max(0, active - 1);
      if (active === 0) hide();
    };
    return originalFetch(input, init).then(
      (response) => { finish(); return response; },
      (error) => { finish(); throw error; },
    );
  };
}
