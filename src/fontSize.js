/* ==========================================================================
   Font size preference (Settings → Font size: Small / Medium / Large)
   The choice is saved in this browser and applied as
   <html data-font-size="small|medium|large">. The CSS in styles/index.css
   scales the whole screen with "zoom" (the app uses fixed pixel sizes, so
   zoom is the one way to make every text, icon and box grow together).

   Because zoom also changes on-screen measurements, code that measures the
   screen (getBoundingClientRect) and then sets a size or position in px
   divides by uiZoom() first. See utils/fillToBottom.js and utils/fitRows.js.
   ========================================================================== */

const STORAGE_KEY = 'ggg-font-size';

export const FONT_SIZES = [
  { value: 'small', label: 'Small', zoom: 0.9 },
  { value: 'medium', label: 'Medium', zoom: 1 },
  { value: 'large', label: 'Large', zoom: 1.1 },
];
export const DEFAULT_FONT_SIZE = 'medium';

const isValid = (value) => FONT_SIZES.some((size) => size.value === value);

export function readFontSize() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return isValid(saved) ? saved : DEFAULT_FONT_SIZE;
  } catch {
    return DEFAULT_FONT_SIZE;
  }
}

export function applyFontSize(value) {
  const size = isValid(value) ? value : DEFAULT_FONT_SIZE;
  document.documentElement.setAttribute('data-font-size', size);
  // Tables that fill the screen measure again at the new size.
  window.dispatchEvent(new Event('resize'));
}

export function saveFontSize(value) {
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    /* storage blocked — the choice still applies for this visit */
  }
  applyFontSize(value);
}

/* The zoom now in use (0.9 / 1 / 1.1). On-screen sizes are this many times
   the CSS size, so divide a measured value by it before using it in a style. */
export function uiZoom() {
  if (typeof document === 'undefined') return 1;
  const root = document.documentElement;
  const zoom = Number(root.currentCSSZoom) || parseFloat(window.getComputedStyle(root).zoom) || 1;
  return zoom > 0 ? zoom : 1;
}
