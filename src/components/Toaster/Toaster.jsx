import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, CircleAlert, Info, X } from 'lucide-react';
import { TOAST_EVENT } from '../../utils/toast';
import './toaster.css';

/* ===== NOTIFICATION POP-UPS (bottom-right, 2026-11-06) =====
   Shown once in App.jsx. Listens for showToast() (src/utils/toast.js).
   - Newest at the bottom, at most 4 at a time (older ones close first).
   - Closes by itself (info/success 6 s, warning 9 s, error 10 s); pointing
     at a pop-up pauses its timer so it can be read; × closes it at once.
   - The same text shown twice in a row is not stacked again. */
const DEFAULT_DURATION = { info: 6000, success: 6000, warning: 9000, error: 10000 };
const ICONS = { info: Info, success: CheckCircle2, warning: AlertTriangle, error: CircleAlert };
const MAX_VISIBLE = 4;

let nextId = 1;

export default function Toaster() {
  const [toasts, setToasts] = useState([]);
  const timers = useRef({});

  const close = (id) => {
    window.clearTimeout(timers.current[id]);
    delete timers.current[id];
    // Play the slide-out first, then remove it.
    setToasts((list) => list.map((toast) => (toast.id === id ? { ...toast, leaving: true } : toast)));
    window.setTimeout(() => setToasts((list) => list.filter((toast) => toast.id !== id)), 220);
  };

  const startTimer = (toast) => {
    if (!toast.duration) return;
    window.clearTimeout(timers.current[toast.id]);
    timers.current[toast.id] = window.setTimeout(() => close(toast.id), toast.duration);
  };

  useEffect(() => {
    const onToast = (event) => {
      const { message, type = 'info', title, duration, action } = event.detail || {};
      if (!message) return;
      const kind = ICONS[type] ? type : 'info';
      const toast = {
        id: nextId++,
        message: String(message),
        type: kind,
        title,
        action,
        duration: duration === 0 ? 0 : (duration || DEFAULT_DURATION[kind]),
      };
      setToasts((list) => {
        const last = list[list.length - 1];
        if (last && !last.leaving && last.message === toast.message && last.type === toast.type) {
          startTimer(last);   // same message again: just keep it up longer
          return list;
        }
        const next = [...list, toast];
        next.slice(0, Math.max(0, next.length - MAX_VISIBLE)).forEach((old) => window.clearTimeout(timers.current[old.id]));
        return next.slice(-MAX_VISIBLE);
      });
      startTimer(toast);
    };
    window.addEventListener(TOAST_EVENT, onToast);
    return () => {
      window.removeEventListener(TOAST_EVENT, onToast);
      Object.values(timers.current).forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  if (toasts.length === 0) return null;

  return createPortal(
    <div className="ggg-toasts" aria-live="polite" aria-relevant="additions">
      {toasts.map((toast) => {
        const Icon = ICONS[toast.type];
        return (
          <div
            key={toast.id}
            className={`ggg-toast is-${toast.type}${toast.leaving ? ' is-leaving' : ''}`}
            role={toast.type === 'error' || toast.type === 'warning' ? 'alert' : 'status'}
            onMouseEnter={() => window.clearTimeout(timers.current[toast.id])}
            onMouseLeave={() => startTimer(toast)}
          >
            <span className="ggg-toast-icon" aria-hidden="true"><Icon size={16} /></span>
            <div className="ggg-toast-body">
              {toast.title && <strong className="ggg-toast-title">{toast.title}</strong>}
              <p className="ggg-toast-text">{toast.message}</p>
              {toast.action?.label && (
                <button
                  type="button"
                  className="ggg-toast-action"
                  onClick={() => { toast.action.onClick?.(); close(toast.id); }}
                >
                  {toast.action.label}
                </button>
              )}
            </div>
            <button type="button" className="ggg-toast-close" onClick={() => close(toast.id)} aria-label="Close notification">
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>,
    document.body,
  );
}
