import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './eventRangeCalendar.css';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/* ===== EVENT DATE RANGE CALENDAR (2026-11-11) =====
   Our own calendar for the Seasonal Adjustments event dates, because the
   browser's date picker cannot show a start-to-end range.
   - Start and end days: filled (theme button colour).
   - Days between: light tint, so the user sees every day the event covers.
   - While picking the end day, hovering previews the range.
   Dates are plain "YYYY-MM-DD" strings (no time zone mix-ups).
   single + maxDate (2026-11-11): one date only, used by the Stock Control
   date box; days after maxDate cannot be picked.
   Styles: eventRangeCalendar.css. */

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const pad = (n) => String(n).padStart(2, '0');
const toKey = (year, month, day) => `${year}-${pad(month + 1)}-${pad(day)}`;   // month: 0–11
export const todayKey = () => {
  const now = new Date();
  return toKey(now.getFullYear(), now.getMonth(), now.getDate());
};
const parseKey = (key) => {
  const [y, m, d] = String(key || '').split('-').map(Number);
  return y && m && d ? { year: y, month: m - 1, day: d } : null;
};

/* "2026-11-11" → "Nov 11, 2026" (for the date boxes). */
export const formatEventDate = (key) => {
  const parts = parseKey(key);
  return parts ? `${SHORT_MONTHS[parts.month]} ${parts.day}, ${parts.year}` : '';
};

/* Number of days from start to end, both counted (Nov 11–20 = 10 days). */
const daysBetween = (start, end) => {
  const a = parseKey(start);
  const b = parseKey(end);
  if (!a || !b) return 0;
  const ms = Date.UTC(b.year, b.month, b.day) - Date.UTC(a.year, a.month, a.day);
  return Math.round(ms / 86400000) + 1;
};

/**
 * picking: 'start' | 'end' — which date the next click sets.
 * onPick({ startDate, endDate, next }): next = 'end' (keep open) or null (close).
 */
export default function EventRangeCalendar({ startDate, endDate, picking, onPick, onClose, anchorRef, single = false, maxDate = '' }) {
  const first = parseKey(picking === 'end' ? (endDate || startDate) : startDate) || parseKey(todayKey());
  const [view, setView] = useState({ year: first.year, month: first.month });
  const [hover, setHover] = useState('');
  const rootRef = useRef(null);
  const today = todayKey();

  /* Floating layer (2026-11-11): drawn on top of everything (portal to the
     page body), placed under the date boxes, or above them when there is no
     room below. Positions are divided by the page zoom (Settings font size
     uses CSS zoom on <html>). */
  const [place, setPlace] = useState(null);
  useLayoutEffect(() => {
    const update = () => {
      const anchor = anchorRef?.current;
      const box = rootRef.current;
      if (!anchor || !box) return;
      const zoom = parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
      const rect = anchor.getBoundingClientRect();
      const width = box.offsetWidth * zoom;
      const height = box.offsetHeight * zoom;
      const gap = 6 * zoom;
      const viewW = window.innerWidth;
      const viewH = window.innerHeight;
      let top = rect.bottom + gap;
      if (top + height > viewH - 8 && rect.top - gap - height > 8) top = rect.top - gap - height;
      const left = Math.max(8, Math.min(rect.left, viewW - width - 8));
      setPlace({ top: top / zoom, left: left / zoom });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [anchorRef, picking]);

  // A click outside the calendar (and outside the two date boxes) closes it.
  useEffect(() => {
    const onDown = (event) => {
      if (rootRef.current?.contains(event.target)) return;
      if (event.target.closest?.('.f-date-trigger, .sc-date-trigger')) return;
      onClose();
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [onClose]);

  // Esc closes the calendar.
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  // 6 rows × 7 days, starting on the Sunday on or before the 1st.
  const cells = useMemo(() => {
    const firstWeekday = new Date(view.year, view.month, 1).getDay();
    const list = [];
    for (let i = 0; i < 42; i += 1) {
      const date = new Date(view.year, view.month, 1 - firstWeekday + i);
      list.push({
        key: toKey(date.getFullYear(), date.getMonth(), date.getDate()),
        day: date.getDate(),
        outside: date.getMonth() !== view.month,
      });
    }
    return list;
  }, [view]);

  // While picking the end day, the hovered day previews the range.
  const rangeEnd = single ? '' : picking === 'end' && startDate && !endDate && hover && hover >= startDate ? hover : endDate;

  const moveMonth = (step) => setView(({ year, month }) => {
    const date = new Date(year, month + step, 1);
    return { year: date.getFullYear(), month: date.getMonth() };
  });

  const pick = (key) => {
    if (maxDate && key > maxDate) return;
    if (single) {
      onPick({ startDate: key, endDate: '', next: null });
      return;
    }
    if (picking === 'start' || !startDate || key < startDate) {
      // New start day; an end day before it is cleared.
      onPick({ startDate: key, endDate: endDate && endDate >= key && picking === 'start' ? endDate : '', next: 'end' });
      return;
    }
    onPick({ startDate, endDate: key, next: null });
  };

  const goToday = () => {
    const parts = parseKey(today);
    setView({ year: parts.year, month: parts.month });
    pick(today);
  };

  const count = startDate && rangeEnd ? daysBetween(startDate, rangeEnd) : 0;
  const status = single
    ? (formatEventDate(startDate) || 'Pick a day')
    : !startDate
    ? 'Pick the start day'
    : !endDate && picking === 'end' && !(hover && hover >= startDate)
      ? 'Pick the end day'
      : `${count.toLocaleString()} ${count === 1 ? 'day' : 'days'}`;

  return createPortal(
    <div
      ref={rootRef}
      className="f-rcal f-rcal-floating"
      role="group"
      aria-label={single ? 'Choose the date' : picking === 'end' ? 'Choose the end date' : 'Choose the start date'}
      style={place ? { top: place.top, left: place.left } : { visibility: 'hidden' }}
    >
      <div className="f-rcal-head">
        <button type="button" className="f-rcal-nav" onClick={() => moveMonth(-1)} aria-label="Previous month">
          <ChevronLeft size={16} aria-hidden="true" />
        </button>
        <span className="f-rcal-title" aria-live="polite">{MONTHS[view.month]} {view.year}</span>
        <button type="button" className="f-rcal-nav" onClick={() => moveMonth(1)} aria-label="Next month">
          <ChevronRight size={16} aria-hidden="true" />
        </button>
      </div>

      <div className="f-rcal-grid" onMouseLeave={() => setHover('')}>
        {WEEKDAYS.map((name) => <span key={name} className="f-rcal-weekday" aria-hidden="true">{name}</span>)}
        {cells.map((cell) => {
          const isStart = cell.key === startDate;
          const isEnd = Boolean(rangeEnd) && cell.key === rangeEnd;
          const inside = Boolean(startDate && rangeEnd) && cell.key > startDate && cell.key < rangeEnd;
          const classes = ['f-rcal-day'];
          if (cell.outside) classes.push('is-outside');
          if (inside) classes.push('is-between');
          if (isStart) classes.push('is-start');
          if (isEnd) classes.push('is-end');
          if (isStart && (!rangeEnd || isEnd)) classes.push('is-single');
          if (cell.key === today) classes.push('is-today');
          const blocked = Boolean(maxDate) && cell.key > maxDate;
          if (blocked) classes.push('is-disabled');
          return (
            <button
              key={cell.key}
              type="button"
              className={classes.join(' ')}
              aria-label={formatEventDate(cell.key)}
              aria-pressed={isStart || isEnd}
              disabled={blocked}
              onMouseEnter={() => setHover(cell.key)}
              onFocus={() => setHover(cell.key)}
              onClick={() => pick(cell.key)}
            >
              {cell.day}
            </button>
          );
        })}
      </div>

      <div className="f-rcal-foot">
        {single
          ? <span className="f-rcal-link-gap" aria-hidden="true" />
          : <button type="button" className="f-rcal-link" onClick={() => onPick({ startDate: '', endDate: '', next: 'start' })}>Clear</button>}
        <span className="f-rcal-count">{status}</span>
        <button type="button" className="f-rcal-link" onClick={goToday}>Today</button>
      </div>
    </div>,
    document.body,
  );
}
