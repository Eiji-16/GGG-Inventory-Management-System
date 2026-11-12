import React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

/* ===== PROMOTE CONFIRM (2026-11-12) =====
   Asks "Yes / No" before someone is given more power: approving a request
   as Admin, creating an Admin or Super Admin account, or changing a role to
   a higher one. Uses the system's own confirm window (staff.css), never the
   browser's confirm box.
   item = { name, email, roleLabel } — null hides the window. */
export default function PromoteConfirm({ item, busy = false, onYes, onNo }) {
  if (!item) return null;

  return createPortal(
    <div
      className="st-modal-overlay st-account-confirm-overlay"
      onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onNo(); }}
      onKeyDown={(event) => { if (event.key === 'Escape' && !busy) onNo(); }}
    >
      <section className="st-modal st-account-confirm" role="dialog" aria-modal="true" aria-labelledby="st-promote-title">
        <header className="st-modal-header">
          <div>
            <p className="st-modal-eyebrow">Promote account</p>
            <h2 id="st-promote-title">Make {item.name || 'this person'} {item.roleLabel}?</h2>
          </div>
          <button type="button" className="st-modal-close" aria-label="Close confirmation" onClick={onNo} disabled={busy}>
            <X size={18} />
          </button>
        </header>
        <div className="st-account-confirm-body">
          <p>
            Do you really want to give this account the <strong>{item.roleLabel}</strong> role?
            {item.roleLabel === 'Super Admin'
              ? ' A Super Admin can do everything, including managing every account and the system settings.'
              : ' An Admin can use more features than Staff, as set in Settings → Role Access.'}
          </p>
          <div className="st-account-confirm-identity">
            <span>{item.name}</span>
            <span>{item.email}</span>
          </div>
        </div>
        <footer className="st-account-confirm-actions">
          <button type="button" className="st-confirm-cancel" onClick={onNo} disabled={busy} autoFocus>No</button>
          <button type="button" className="st-confirm-primary" onClick={onYes} disabled={busy}>
            {busy ? 'Saving…' : `Yes, make ${item.roleLabel}`}
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
