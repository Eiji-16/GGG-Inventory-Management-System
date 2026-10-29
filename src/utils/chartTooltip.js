import { uiZoom } from '../fontSize';

/* ===== CHART HOVER TOOLTIP (one for the whole system) =====
   Any element with a data-tip attribute shows a small data box next to the
   mouse while it is hovered (or next to the element when it has keyboard
   focus). Used by every chart: bars, lines, dots, ring and pie slices.

   data-tip="Title\nline 2\nline 3"  → first line in bold, the rest below.
   Optional data-tip-color="#43D39E" adds a colour dot before the title.

   Started once in layouts/App.jsx with startChartTooltip(). */
let started = false;

export function startChartTooltip() {
  if (started || typeof document === 'undefined') return;
  if (!document.body) {
    document.addEventListener('DOMContentLoaded', startChartTooltip, { once: true });
    return;
  }
  started = true;

  const tip = document.createElement('div');
  tip.className = 'chart-tip';
  tip.setAttribute('role', 'tooltip');
  tip.setAttribute('aria-hidden', 'true');
  document.body.appendChild(tip);

  let current = null;

  const fill = (element) => {
    const text = element.getAttribute('data-tip') || '';
    const color = element.getAttribute('data-tip-color');
    const [title, ...lines] = text.split('\n');
    tip.replaceChildren();
    const head = document.createElement('strong');
    if (color) {
      const dot = document.createElement('i');
      dot.style.background = color;
      head.appendChild(dot);
    }
    head.appendChild(document.createTextNode(title));
    tip.appendChild(head);
    lines.filter(Boolean).forEach((line) => {
      const row = document.createElement('span');
      row.textContent = line;
      tip.appendChild(row);
    });
  };

  // x / y are screen pixels. The tooltip sits inside the zoomed page, so
  // they are turned into page pixels first (Settings → Font size).
  const place = (x, y) => {
    const zoom = uiZoom();
    const viewW = window.innerWidth / zoom;
    const viewH = window.innerHeight / zoom;
    const px = x / zoom;
    const py = y / zoom;
    const width = tip.offsetWidth;
    const height = tip.offsetHeight;
    let left = px + 14;
    let top = py - height - 12;
    if (left + width > viewW - 8) left = px - width - 14;
    if (top < 8) top = py + 18;
    if (top + height > viewH - 8) top = viewH - height - 8;
    tip.style.left = `${Math.max(8, left)}px`;
    tip.style.top = `${Math.max(8, top)}px`;
  };

  const show = (element, x, y) => {
    current = element;
    fill(element);
    tip.classList.add('is-visible');
    place(x, y);
  };

  const hide = () => {
    current = null;
    tip.classList.remove('is-visible');
  };

  document.addEventListener('pointerover', (event) => {
    if (event.pointerType === 'touch') return;
    const element = event.target.closest?.('[data-tip]');
    if (!element) {
      if (current) hide();
      return;
    }
    if (element !== current) show(element, event.clientX, event.clientY);
  });

  document.addEventListener('pointermove', (event) => {
    if (current) place(event.clientX, event.clientY);
  });

  document.addEventListener('pointerout', (event) => {
    if (!current) return;
    const next = event.relatedTarget;
    if (!next || !current.contains(next)) {
      const nextTip = next?.closest?.('[data-tip]');
      if (nextTip) show(nextTip, event.clientX, event.clientY);
      else hide();
    }
  });

  // Keyboard: show the box above the focused bar / slice.
  document.addEventListener('focusin', (event) => {
    const element = event.target.closest?.('[data-tip]');
    if (!element) return;
    const box = element.getBoundingClientRect();
    show(element, box.left + box.width / 2, box.top);
  });
  document.addEventListener('focusout', () => { if (current) hide(); });

  window.addEventListener('scroll', hide, true);
  window.addEventListener('blur', hide);
}
