import { useEffect, useRef } from 'react';

/* ===== NOTIFICATION POP-UPS (2026-11-06) =====
   Page messages ("Request sent", "No forecast yet…", "Saved", warnings) show
   as small pop-ups in the bottom-right corner, like Windows notifications,
   instead of a banner across the top of the page.

   showToast(message, { type, title, duration, action })
     type     'info' | 'success' | 'warning' | 'error'   (colour + icon)
     title    optional bold first line
     duration milliseconds before it closes by itself (0 = stays until closed)
     action   optional { label, onClick } button inside the pop-up

   The <Toaster /> component (src/components/Toaster) listens for the event
   and draws the pop-ups. Error messages inside a pop-up form stay next to
   that form, because that is where the person is typing. */
export const TOAST_EVENT = 'ggg-toast';

export function showToast(message, options = {}) {
  if (!message) return;
  window.dispatchEvent(new CustomEvent(TOAST_EVENT, { detail: { message, ...options } }));
}

/* For pages that keep the message in state (setNotice('…')): show it as a
   pop-up when it appears, then clear the state so the same message can show
   again next time. Renders nothing.
     <PageToast message={notice} type="success" onShown={() => setNotice('')} />
   Without onShown (a message worked out from the page, like the forecast
   note), it shows again only when the text changes. */
export function PageToast({ message, type = 'info', title, duration, action, onShown }) {
  const lastShown = useRef('');
  useEffect(() => {
    const text = typeof message === 'string' ? message.trim() : '';
    if (!text) { lastShown.current = ''; return; }
    if (!onShown && text === lastShown.current) return;
    lastShown.current = text;
    showToast(text, { type, title, duration, action });
    onShown?.();
  }, [message]); // only a new message shows a pop-up
  return null;
}
