import React, { useLayoutEffect, useRef, useState } from 'react';

/* ==========================================================================
   MARQUEE VALUE FOR CARDS (2026-11-10)
   Wrap a card's big number with <MarqueeText>. If it fits, nothing changes.
   If it is wider than the card (e.g. ₱999,890,000.00), it slowly slides
   left to show the end, then slides back — so it is never cut off and never
   pushes the card wider. Hovering pauses it. "Reduce motion" in the device
   settings shows "…" instead of moving. Styles: src/styles/polish.css.

   <span className="db-kpi-tile-value"><MarqueeText>{value}</MarqueeText></span>
   ========================================================================== */
export default function MarqueeText({ children, className = '' }) {
  const boxRef = useRef(null);
  const textRef = useRef(null);
  const [shift, setShift] = useState(0);

  useLayoutEffect(() => {
    const box = boxRef.current;
    const text = textRef.current;
    if (!box || !text) return undefined;
    const measure = () => {
      const extra = Math.ceil(text.scrollWidth - box.clientWidth);
      setShift(extra > 1 ? extra : 0);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    observer.observe(text);   // also catches the count-up numbers growing
    return () => observer.disconnect();
  }, []);

  const moving = shift > 0;
  // About 30 px per second, at least 4 seconds each way.
  const seconds = Math.max(4, Math.round(shift / 30) + 3);

  return (
    <span
      ref={boxRef}
      className={`ui-marquee${moving ? ' is-moving' : ''}${className ? ` ${className}` : ''}`}
      style={moving ? { '--marquee-shift': `-${shift}px`, '--marquee-time': `${seconds}s` } : undefined}
      title={moving ? (textRef.current?.textContent || undefined) : undefined}
    >
      <span ref={textRef} className="ui-marquee-text">{children}</span>
    </span>
  );
}
