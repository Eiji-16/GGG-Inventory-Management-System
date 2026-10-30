import React, { useEffect, useRef, useState } from 'react';

/* ==========================================================================
   COUNT-UP NUMBERS (Dashboard and Reports summary numbers)
   A number counts up smoothly from its last value to the new one (from 0
   the first time it appears), so changes are easy to notice.

   - Display only: the real value is always what ends on screen, and screen
     readers get the final text straight away (the moving digits are hidden
     from them).
   - It runs once when the value changes — a re-render with the same value
     does nothing.
   - "Reduce motion" in the device settings shows the final number at once.

   <CountUp value={1234} />                 → "1,234"
   <CountUp value={25} format={(n) => `${n}%`} />
   <CountUpText text="₱21,909.00" />        → animates the number inside any
                                               already-formatted text
   ========================================================================== */

const DURATION = 650;                                   // ms
const easeOut = (t) => 1 - (1 - t) ** 3;                // fast start, soft landing
const prefersReducedMotion = () => (
  typeof window !== 'undefined'
  && window.matchMedia
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches
);
const defaultFormat = (n) => Math.round(n).toLocaleString('en-PH');

function useCountUp(target, decimals = 0) {
  const valid = Number.isFinite(target);
  const [shown, setShown] = useState(() => (valid && !prefersReducedMotion() ? 0 : target));
  const shownRef = useRef(shown);
  shownRef.current = shown;

  useEffect(() => {
    if (!valid) { setShown(target); return undefined; }
    const from = Number.isFinite(shownRef.current) ? shownRef.current : 0;
    if (from === target || prefersReducedMotion()) { setShown(target); return undefined; }
    let frame = 0;
    const start = performance.now();
    const factor = 10 ** decimals;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / DURATION);
      const value = t >= 1 ? target : Math.round((from + (target - from) * easeOut(t)) * factor) / factor;
      setShown(value);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, valid, decimals]);

  return shown;
}

export function CountUp({ value, format = defaultFormat, decimals = 0 }) {
  const shown = useCountUp(Number(value), decimals);
  return (
    <span className="ui-count">
      <span aria-hidden="true">{format(shown)}</span>
      <span className="ui-count-sr">{format(Number(value))}</span>
    </span>
  );
}

/* Animate the first number inside a formatted text such as "₱21,909.00",
   "25%", "1.234,50 €" or "50". The text around it stays as it is, and the
   number keeps the same thousands / decimal marks. Text without a number is
   shown as it is. */
const NUMBER = /\d[\d.,   ]*\d|\d/;
function parseNumberText(text) {
  const match = String(text ?? '').match(NUMBER);
  if (!match) return null;
  const token = match[0];
  const marks = token.match(/[.,]/g) || [];
  let decimalMark = '';
  if (marks.length) {
    const last = marks[marks.length - 1];
    const after = token.slice(token.lastIndexOf(last) + 1).replace(/\D/g, '');
    // The last mark is the decimal point unless exactly 3 digits follow it
    // (then it separates thousands, as in "21,909").
    if (after.length !== 3) decimalMark = last;
  }
  const groupMark = (token.match(/[.,   ]/g) || []).find((m) => m !== decimalMark) || '';
  const [intPart, decPart = ''] = decimalMark ? token.split(decimalMark) : [token, ''];
  const value = Number(`${intPart.replace(/\D/g, '')}.${decPart.replace(/\D/g, '') || '0'}`);
  if (!Number.isFinite(value)) return null;
  return {
    before: text.slice(0, match.index),
    after: text.slice(match.index + token.length),
    value,
    decimals: decPart.replace(/\D/g, '').length,
    decimalMark,
    groupMark,
  };
}
function formatLike(value, info) {
  const [int, dec] = value.toFixed(info.decimals).split('.');
  const grouped = info.groupMark ? int.replace(/\B(?=(\d{3})+(?!\d))/g, info.groupMark) : int;
  return `${info.before}${grouped}${dec ? `${info.decimalMark}${dec}` : ''}${info.after}`;
}

export function CountUpText({ text }) {
  const info = parseNumberText(text);
  const shown = useCountUp(info ? info.value : NaN, info ? info.decimals : 0);
  if (!info) return text ?? null;
  return (
    <span className="ui-count">
      <span aria-hidden="true">{formatLike(Number.isFinite(shown) ? shown : info.value, info)}</span>
      <span className="ui-count-sr">{text}</span>
    </span>
  );
}

export default CountUp;
