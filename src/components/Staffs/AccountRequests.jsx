import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, ChevronDown, Clock3, MailCheck, RefreshCw, Send, UserPlus, XCircle } from 'lucide-react';

/* ===== ACCOUNT REQUESTS (Super Admin, Staffs page, 2026-11-03) =====
   People who clicked "Request Account Access" on the login page.
   Approve & Invite → the server emails a one-time setup link (24 hours).
   Send link again → a new link; the old one stops working.
   Reject → the request is closed.
   The bell also shows new requests (see LandingPage). */
const csrf = () => document.querySelector('meta[name="csrf-token"]')?.content || '';

const STATUS = {
  pending: { label: 'Waiting for you', cls: 'is-pending', Icon: Clock3 },
  approved: { label: 'Link sent', cls: 'is-approved', Icon: MailCheck },
  completed: { label: 'Account ready', cls: 'is-completed', Icon: CheckCircle2 },
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

export default function AccountRequests({ onChanged }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(null);   // { type, text }
  const [busyId, setBusyId] = useState(null);
  const [roles, setRoles] = useState({});        // request id → 'staff' | 'admin'
  const [showDone, setShowDone] = useState(false);

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

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 30000);
    return () => window.clearInterval(timer);
  }, [load]);

  const act = async (request, action) => {
    if (action === 'reject' && !window.confirm(`Reject the account request of ${request.name}?`)) return;
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

  if (loading && !requests.length) return null;
  if (!requests.length && !error) return null;

  return (
    <section className="st-requests" aria-labelledby="st-requests-title">
      <div className="st-requests-head">
        <span className="st-requests-icon" aria-hidden="true"><UserPlus size={16} /></span>
        <div>
          <h3 id="st-requests-title">
            Account requests
            {pendingCount > 0 && <span className="st-requests-badge">{pendingCount} new</span>}
          </h3>
          <p className="hint-text">From “Request Account Access” on the login page. Approving emails a one-time setup link (valid 24 hours) where the person sets a password and an authenticator app.</p>
        </div>
        <button type="button" className="st-requests-refresh" onClick={load} aria-label="Refresh account requests" title="Refresh"><RefreshCw size={14} /></button>
      </div>

      {error && <p className="st-create-account-error" role="alert">{error}</p>}
      {notice && <p className={notice.type === 'error' ? 'st-create-account-error' : 'st-requests-ok'} role="status">{notice.text}</p>}

      {error ? null : open.length === 0 ? (
        <p className="st-requests-empty">No requests waiting.</p>
      ) : (
        <ul className="st-requests-list">
          {open.map((request) => {
            const meta = STATUS[request.status];
            const left = request.status === 'approved' ? hoursLeft(request.linkExpiresAt) : null;
            return (
              <li key={request.id} className={`st-request ${meta.cls}`}>
                <div className="st-request-who">
                  <strong>{request.name}</strong>
                  <span>{request.email}</span>
                  <small>{request.department || '—'} · asked {when(request.createdAt)}</small>
                </div>
                <span className={`st-request-status ${meta.cls}`}><meta.Icon size={12} aria-hidden="true" /> {meta.label}</span>
                {request.status === 'pending' ? (
                  <div className="st-request-actions">
                    <label className="st-request-role">
                      <span>Role</span>
                      <select
                        value={roles[request.id] || 'staff'}
                        onChange={(event) => setRoles((prev) => ({ ...prev, [request.id]: event.target.value }))}
                        disabled={busyId === request.id}
                      >
                        <option value="staff">Staff</option>
                        <option value="admin">Admin</option>
                      </select>
                    </label>
                    <button type="button" className="st-create-account-button" onClick={() => act(request, 'approve')} disabled={busyId === request.id}>
                      <Send size={14} aria-hidden="true" /> {busyId === request.id ? 'Sending…' : 'Approve & Invite'}
                    </button>
                    <button type="button" className="st-request-reject" onClick={() => act(request, 'reject')} disabled={busyId === request.id}>Reject</button>
                  </div>
                ) : (
                  <div className="st-request-actions">
                    <small className="st-request-link">
                      As {request.role === 'admin' ? 'Admin' : 'Staff'} · {left === 'expired' ? 'link expired' : `link ${left}`}{request.linkOpened ? ' · opened' : ''}
                    </small>
                    <button type="button" className="st-deactivated-button" onClick={() => act(request, 'resend')} disabled={busyId === request.id}>
                      <RefreshCw size={14} aria-hidden="true" /> Send link again
                    </button>
                    <button type="button" className="st-request-reject" onClick={() => act(request, 'reject')} disabled={busyId === request.id}>Cancel</button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {done.length > 0 && (
        <div className="st-requests-done">
          <button type="button" className="st-requests-toggle" onClick={() => setShowDone((v) => !v)} aria-expanded={showDone}>
            <ChevronDown size={14} aria-hidden="true" className={showDone ? 'is-open' : ''} /> Finished requests ({done.length})
          </button>
          {showDone && (
            <ul className="st-requests-list is-compact">
              {done.map((request) => {
                const meta = STATUS[request.status];
                return (
                  <li key={request.id} className={`st-request ${meta.cls}`}>
                    <div className="st-request-who">
                      <strong>{request.name}</strong>
                      <span>{request.email}</span>
                    </div>
                    <span className={`st-request-status ${meta.cls}`}><meta.Icon size={12} aria-hidden="true" /> {meta.label}</span>
                    <small className="st-request-link">{request.status === 'completed' ? `Set up ${when(request.completedAt)}` : `By ${request.reviewedBy || 'Super Admin'} · ${when(request.reviewedAt)}`}</small>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
