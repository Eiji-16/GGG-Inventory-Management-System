import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import CustomSelect from '../Forecasting/CustomSelect';
import { PageToast } from '../../utils/toast';
import { CheckCircle2, Clock3, MailCheck, RefreshCw, Send, UserPlus, X, XCircle } from 'lucide-react';

/* ===== ACCOUNT REQUESTS (Super Admin, Staffs page, 2026-11-03) =====
   People who clicked "Request Account Access" on the login page.
   Approve & Invite → the server emails a one-time setup link (24 hours).
   Send link again → a new link; the old one stops working.
   Reject → the request is closed.
   The bell also shows new requests (see LandingPage). */
const csrf = () => document.querySelector('meta[name="csrf-token"]')?.content || '';

const STATUS = {
  pending: { label: 'Waiting for you', cls: 'is-pending', Icon: Clock3 },
  approved: { label: 'Account created · not verified', cls: 'is-approved', Icon: MailCheck },
  completed: { label: 'Verified', cls: 'is-completed', Icon: CheckCircle2 },
  rejected: { label: 'Rejected', cls: 'is-rejected', Icon: XCircle },
};

const when = (iso) => (iso ? new Date(iso).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');
const hoursLeft = (iso) => {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 'expired';
  const h = Math.floor(ms / 3600000);
  return h >= 1 ? `${h} h left` : `${Math.max(1, Math.round(ms / 60000))} min left`;
};

/* 2026-11-06: shown as its own tab on the Staffs page ("Accounts | Account
   requests") as one table: waiting requests first, finished ones below.
   onCount(n) tells the page how many are waiting (badge on the tab);
   hidden keeps it loading in the background while the Accounts tab is open. */
export default function AccountRequests({ onChanged, onCount, hidden = false }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(null);   // { type, text }
  const [busyId, setBusyId] = useState(null);
  const [roles, setRoles] = useState({});        // request id → 'staff' | 'admin'

  const load = useCallback(async () => {
    try {
      const response = await fetch('/staff/account-requests', { headers: { Accept: 'application/json' }, cache: 'no-store' });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.message || `Could not load account requests (${response.status}).`);
      }
      const data = await response.json();
      setRequests(Array.isArray(data) ? data : []);
      setError('');
    } catch (loadError) {
      setError(loadError.message || 'Could not load account requests.');
    } finally {
      setLoading(false);
    }
  }, []);

  /* 2026-11-12: refreshes by itself (no Refresh button): right away when the
     main page sees new data (event from LandingPage, checked every 5 s),
     every 15 seconds, and when you come back to this browser tab. */
  useEffect(() => {
    load();
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') load(); }, 15000);
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    window.addEventListener('ggg-account-requests-changed', load);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('ggg-account-requests-changed', load);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load]);

  /* Reject / Cancel asks first in the system's own confirm window
     (2026-11-11; was the browser's confirm box). */
  const [confirmItem, setConfirmItem] = useState(null);

  const act = async (request, action, confirmed = false) => {
    if (action === 'reject' && !confirmed) {
      setConfirmItem(request);
      return;
    }
    setConfirmItem(null);
    setBusyId(request.id);
    setNotice(null);
    try {
      const response = await fetch(`/staff/account-requests/${request.id}/${action}`, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-CSRF-TOKEN': csrf() },
        body: JSON.stringify(action === 'approve' ? { role: roles[request.id] || 'staff' } : {}),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error((data.errors ? Object.values(data.errors).flat()[0] : data.message) || `Error ${response.status}`);
      setNotice({
        type: action !== 'reject' && data.emailed === false ? 'error' : 'ok',
        text: data.message || (action === 'reject' ? `Rejected the request of ${request.name}.` : 'Done.'),
      });
      await load();
      onChanged?.();
    } catch (actionError) {
      setNotice({ type: 'error', text: actionError.message });
    } finally {
      setBusyId(null);
    }
  };

  const open = requests.filter((r) => r.status === 'pending' || r.status === 'approved');
  const done = requests.filter((r) => r.status === 'completed' || r.status === 'rejected');
  const pendingCount = requests.filter((r) => r.status === 'pending').length;

  useEffect(() => { onCount?.(pendingCount); }, [pendingCount]); // badge on the tab

  if (hidden) return <PageToast message={notice?.text} type={notice?.type === 'error' ? 'error' : 'success'} onShown={() => setNotice(null)} />;

  const rows = [...open, ...done];

  return (
    <section className="st-table-card st-requests-view" aria-labelledby="st-requests-title">
      <PageToast message={notice?.text} type={notice?.type === 'error' ? 'error' : 'success'} onShown={() => setNotice(null)} />
      <div className="st-table-heading st-requests-heading">
        <div>
          <h3 id="st-requests-title">
            <UserPlus size={16} aria-hidden="true" /> Account requests
            {pendingCount > 0 && <span className="st-requests-badge">{pendingCount} new</span>}
          </h3>
          <p className="hint-text">From “Request Account Access” on the login page. Approve & Invite creates the account at once and emails a verification link (valid 24 hours). The person can sign in after verifying their email, setting a password and an authenticator app.</p>
        </div>
      </div>

      {error && <p className="st-create-account-error" role="alert">{error}</p>}

      <div className="st-table-scroll">
        <table className="st-table st-requests-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Asked</th>
              <th>Status</th>
              <th className="st-th-actions">Details / Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && !requests.length ? (
              <tr><td colSpan={4} className="st-empty ui-loading">Loading account requests…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={4} className="st-empty">{error ? 'Could not load the requests.' : 'No account requests yet.'}</td></tr>
            ) : rows.map((request) => {
              const meta = STATUS[request.status] || STATUS.pending;
              const left = request.status === 'approved' ? hoursLeft(request.linkExpiresAt) : null;
              const busy = busyId === request.id;
              return (
                <tr key={request.id} className={`st-request-row ${meta.cls}`}>
                  <td className="st-cell-name" data-label="Name">
                    <span className="st-request-who">
                      <strong>{request.name}</strong>
                      <span>{request.email}</span>
                    </span>
                  </td>
                  <td className="st-cell-muted" data-label="Asked">{when(request.createdAt) || '—'}</td>
                  <td className="st-cell-status" data-label="Status">
                    <span className={`st-request-status ${meta.cls}`}><meta.Icon size={12} aria-hidden="true" /> {meta.label}</span>
                  </td>
                  <td className="st-cell-actions" data-label="Details / Actions">
                    {request.status === 'pending' ? (
                      <div className="st-request-actions is-pending">
                        {/* Themed dropdown (2026-11-11), same as the rest of the system. */}
                        <div className="st-request-role">
                          <span id={`st-role-label-${request.id}`}>Role</span>
                          <CustomSelect
                            id={`st-role-${request.id}`}
                            className="st-role-select"
                            ariaLabel={`Role for ${request.name}`}
                            value={roles[request.id] || 'staff'}
                            onChange={(role) => setRoles((prev) => ({ ...prev, [request.id]: role }))}
                            disabled={busy}
                            options={[
                              { value: 'staff', label: 'Staff' },
                              { value: 'admin', label: 'Admin' },
                            ]}
                          />
                        </div>
                        <button type="button" className="st-create-account-button" onClick={() => act(request, 'approve')} disabled={busy}>
                          <Send size={14} aria-hidden="true" /> {busy ? 'Sending…' : 'Approve & Invite'}
                        </button>
                        <button type="button" className="st-request-reject" onClick={() => act(request, 'reject')} disabled={busy}>Reject</button>
                      </div>
                    ) : request.status === 'approved' ? (
                      <div className="st-request-actions is-approved">
                        <small className="st-request-link">
                          As {request.role === 'admin' ? 'Admin' : 'Staff'} · {left === 'expired' ? 'verification link expired' : `verification link ${left}`}{request.linkOpened ? ' · opened' : ''}
                        </small>
                        <button type="button" className="st-deactivated-button" onClick={() => act(request, 'resend')} disabled={busy}>
                          <RefreshCw size={14} aria-hidden="true" /> Send link again
                        </button>
                        <button type="button" className="st-request-reject" onClick={() => act(request, 'reject')} disabled={busy} title="Cancel: the unverified account moves to the Trash Bin">Cancel</button>
                      </div>
                    ) : (
                      <small className="st-request-link">
                        {request.status === 'completed' ? `Set up ${when(request.completedAt)}` : `By ${request.reviewedBy || 'Super Admin'} · ${when(request.reviewedAt)}`}
                      </small>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {confirmItem && createPortal(
        <div
          className="st-modal-overlay st-account-confirm-overlay"
          onMouseDown={(event) => { if (event.target === event.currentTarget) setConfirmItem(null); }}
          onKeyDown={(event) => { if (event.key === 'Escape') setConfirmItem(null); }}
        >
          <section className="st-modal st-account-confirm" role="dialog" aria-modal="true" aria-labelledby="st-request-confirm-title">
            <header className="st-modal-header">
              <div>
                <p className="st-modal-eyebrow">{confirmItem.status === 'approved' ? 'Cancel account' : 'Account request'}</p>
                <h2 id="st-request-confirm-title">{confirmItem.status === 'approved' ? 'Cancel this account?' : 'Reject this request?'}</h2>
              </div>
              <button type="button" className="st-modal-close" aria-label="Close confirmation" onClick={() => setConfirmItem(null)}>
                <X size={18} />
              </button>
            </header>
            <div className="st-account-confirm-body">
              <p>
                {confirmItem.status === 'approved'
                  ? `${confirmItem.name}'s account was never verified, so it moves to the Trash Bin. The verification link stops working.`
                  : `${confirmItem.name} will not get an account. They can send a new request later.`}
              </p>
              <div className="st-account-confirm-identity">
                <span>{confirmItem.name}</span>
                <span>{confirmItem.email}</span>
              </div>
            </div>
            <footer className="st-account-confirm-actions">
              <button type="button" className="st-confirm-cancel" onClick={() => setConfirmItem(null)} autoFocus>Keep</button>
              <button type="button" className="st-confirm-danger" onClick={() => act(confirmItem, 'reject', true)}>
                {confirmItem.status === 'approved' ? 'Cancel account' : 'Reject request'}
              </button>
            </footer>
          </section>
        </div>,
        document.body,
      )}
    </section>
  );
}
