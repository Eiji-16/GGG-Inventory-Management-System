import React, { useState, useEffect, useMemo } from 'react';
import {
  User,
  Mail,
  Shield,
  Calendar,
  Clock,
  Pencil,
  Check,
  X,
  KeyRound,
  Boxes,
  Calculator,
  TrendingUp,
  LogIn,
  Activity,
} from 'lucide-react';
import './profile.css';

/* ===== ROLE PERMISSIONS (static description per role) ===== */
const ROLE_MATRIX = {
  'Super Admin': [
    'Full access to every module',
    'Create, edit and deactivate accounts',
    'Manage products, suppliers and stock movements',
    'Add or remove custom formulas in Auto Calculator',
    'Set safety stock and export all reports',
  ],
  Admin: [
    'Manage products, suppliers and stock movements',
    'Run Auto Calculator and Sales Forecasting',
    'View and export reports',
    'No access to Staffs or Safety Stock',
  ],
  Staff: [
    'Record stock in / stock out movements',
    'View the dashboard and reports',
    'Manage own profile and settings',
    'No access to products, forecasting or formulas',
  ],
};

/* ===== ACTIVITY ICON MAP ===== */
const ACTIVITY_ICON = {
  boxes: Boxes,
  calculator: Calculator,
  trending: TrendingUp,
  key: KeyRound,
  login: LogIn,
  user: User,
};

const csrf = () => document.querySelector('meta[name="csrf-token"]')?.content || '';

const initialsOf = (name) =>
  (name || '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('') || '?';

export default function Profile() {
  const [user, setUser] = useState(null);
  const [draft, setDraft] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saveError, setSaveError] = useState('');

  const [activity, setActivity] = useState([]);
  const [activityLoading, setActivityLoading] = useState(true);

  /* ===== PASSWORD MODAL ===== */
  const [showPwd, setShowPwd] = useState(false);
  const [pwdError, setPwdError] = useState('');
  const [pwdSuccess, setPwdSuccess] = useState('');
  const [pwdSaving, setPwdSaving] = useState(false);

  /* ===== LOAD PROFILE + ACTIVITY ===== */
  useEffect(() => {
    fetch('/profile', { headers: { Accept: 'application/json' } })
      .then((r) => { if (!r.ok) throw new Error(`Could not load profile (${r.status}).`); return r.json(); })
      .then((data) => { setUser(data); setDraft(data); })
      .catch((e) => setError(e.message || 'Could not load profile.'))
      .finally(() => setLoading(false));

    fetch('/profile/activity', { headers: { Accept: 'application/json' } })
      .then((r) => { if (!r.ok) throw new Error('activity'); return r.json(); })
      .then((data) => setActivity(Array.isArray(data) ? data : []))
      .catch(() => setActivity([]))
      .finally(() => setActivityLoading(false));
  }, []);

  const startEdit = () => { setDraft(user); setSaveError(''); setIsEditing(true); };
  const cancelEdit = () => { setDraft(user); setSaveError(''); setIsEditing(false); };

  const saveEdit = async () => {
    setSaveError('');
    try {
      const response = await fetch('/profile', {
        method: 'PATCH',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-CSRF-TOKEN': csrf() },
        body: JSON.stringify({ name: draft.fullName, email: draft.email, department: draft.department }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const msg = data.errors ? Object.values(data.errors).flat()[0] : data.message;
        throw new Error(msg || `Save failed (${response.status}).`);
      }
      setUser(data);
      setDraft(data);
      setIsEditing(false);
    } catch (e) {
      setSaveError(e.message || 'Could not save your changes.');
    }
  };

  const setField = (key) => (e) =>
    setDraft((prev) => ({ ...prev, [key]: e.target.value }));

  const changePassword = async (event) => {
    event.preventDefault();
    setPwdError('');
    setPwdSuccess('');
    setPwdSaving(true);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch('/profile/password', {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-CSRF-TOKEN': csrf() },
        body: JSON.stringify({
          current_password: form.get('current_password'),
          password: form.get('password'),
          password_confirmation: form.get('password_confirmation'),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const msg = data.errors ? Object.values(data.errors).flat()[0] : data.message;
        throw new Error(msg || `Could not change password (${response.status}).`);
      }
      setPwdSuccess(data.message || 'Your password has been updated.');
      event.target.reset();
      setTimeout(() => { setShowPwd(false); setPwdSuccess(''); }, 1200);
    } catch (e) {
      setPwdError(e.message || 'Could not change the password.');
    } finally {
      setPwdSaving(false);
    }
  };

  const permissions = useMemo(() => (user ? ROLE_MATRIX[user.role] ?? [] : []), [user]);

  if (loading) return <div className="pf-root"><p className="pf-sub">Loading profile…</p></div>;
  if (error) return <div className="pf-root"><p className="pf-sub" role="alert">{error}</p></div>;
  if (!user) return null;

  return (
    <div className="pf-root">
      <div className="pf-grid">

        {/* ===== IDENTITY ===== */}
        <section className="pf-card pf-area-identity">
          <div className="pf-avatar">{initialsOf(user.fullName)}</div>
          <div className="pf-identity-text">
            <h2>{user.fullName}</h2>
            <p className="pf-sub">{user.email}{user.department ? ` · ${user.department}` : ''}</p>
            <span className={`pf-role-pill pf-role-${(user.role || '').replace(/\s+/g, '')}`}>
              <Shield size={12} />
              {user.role}
            </span>
          </div>

          {!isEditing ? (
            <button type="button" className="pf-btn pf-btn-ghost pf-btn-sm" onClick={startEdit}>
              <Pencil size={13} /> Edit profile
            </button>
          ) : (
            <div className="pf-edit-actions">
              <button type="button" className="pf-btn pf-btn-primary pf-btn-sm" onClick={saveEdit}>
                <Check size={13} /> Save
              </button>
              <button type="button" className="pf-btn pf-btn-ghost pf-btn-sm" onClick={cancelEdit}>
                <X size={13} /> Cancel
              </button>
            </div>
          )}
        </section>

        {/* ===== ACCOUNT DETAILS ===== */}
        <section className="pf-card pf-area-details">
          <h3>Account Details</h3>
          <p className="pf-sub">Contact information tied to this account</p>

          {saveError && <p className="pf-inline-error" role="alert">{saveError}</p>}

          <div className="pf-field-grid">
            <div className="pf-field">
              <label htmlFor="pf-fullName"><User size={12} /> Full name</label>
              {isEditing ? (
                <input id="pf-fullName" type="text" value={draft.fullName || ''} onChange={setField('fullName')} />
              ) : (
                <div className="pf-value">{user.fullName}</div>
              )}
            </div>

            <div className="pf-field">
              <label htmlFor="pf-email"><Mail size={12} /> Email address</label>
              {isEditing ? (
                <input id="pf-email" type="email" value={draft.email || ''} onChange={setField('email')} />
              ) : (
                <div className="pf-value">{user.email}</div>
              )}
            </div>

            <div className="pf-field">
              <label htmlFor="pf-department"><Boxes size={12} /> Department</label>
              {isEditing ? (
                <input id="pf-department" type="text" value={draft.department || ''} onChange={setField('department')} placeholder="e.g. Inventory Operations" />
              ) : (
                <div className="pf-value">{user.department || '—'}</div>
              )}
            </div>

            <div className="pf-field">
              <label><Shield size={12} /> Role</label>
              <div className="pf-value pf-value-static">{user.role}</div>
            </div>

            <div className="pf-field">
              <label><Calendar size={12} /> Date joined</label>
              <div className="pf-value pf-value-static">{user.joined}</div>
            </div>

            <div className="pf-field">
              <label><Clock size={12} /> Last login</label>
              <div className="pf-value pf-value-static">{user.lastLogin}</div>
            </div>
          </div>
        </section>

        {/* ===== ROLE ACCESS ===== */}
        <section className="pf-card pf-area-permissions">
          <h3>Role &amp; Permissions</h3>
          <p className="pf-sub">What a {user.role} can do in this system</p>
          <ul className="pf-perm-list">
            {permissions.map((item) => (
              <li key={item}>
                <Check size={13} />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* ===== SECURITY ===== */}
        <section className="pf-card pf-area-security">
          <h3>Security</h3>
          <p className="pf-sub">Keep this account protected</p>
          <div className="pf-security-row">
            <div className="pf-row-icon"><KeyRound size={15} /></div>
            <div className="pf-row-text">
              <div className="pf-row-title">Password</div>
              <div className="pf-sub">Use a strong, unique password</div>
            </div>
            <button type="button" className="pf-btn pf-btn-ghost pf-btn-sm" onClick={() => { setPwdError(''); setPwdSuccess(''); setShowPwd(true); }}>
              Change
            </button>
          </div>
        </section>

        {/* ===== RECENT ACTIVITY ===== */}
        <section className="pf-card pf-area-activity">
          <h3>Recent Activity</h3>
          <p className="pf-sub">Actions recorded under this account</p>
          <div className="pf-scroll">
            {activityLoading ? (
              <p className="pf-sub">Loading activity…</p>
            ) : activity.length === 0 ? (
              <p className="pf-sub">No activity recorded yet.</p>
            ) : (
              <ul className="pf-activity-list">
                {activity.map((row) => {
                  const Icon = ACTIVITY_ICON[row.icon] || Activity;
                  return (
                    <li key={row.id}>
                      <div className="pf-row-icon"><Icon size={14} /></div>
                      <div className="pf-row-text">
                        <div className="pf-row-title">{row.description}</div>
                        <div className="pf-sub">{row.at}</div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

      </div>

      {/* ===== CHANGE PASSWORD MODAL ===== */}
      {showPwd && (
        <div className="pf-modal-overlay" onClick={() => setShowPwd(false)}>
          <div className="pf-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="pf-modal-header">
              <h3><KeyRound size={16} /> Change Password</h3>
              <button type="button" className="pf-btn pf-btn-ghost pf-btn-sm" onClick={() => setShowPwd(false)} aria-label="Close"><X size={16} /></button>
            </div>
            <form className="pf-pwd-form" onSubmit={changePassword}>
              <label>
                Current password
                <input name="current_password" type="password" autoComplete="current-password" required />
              </label>
              <label>
                New password
                <input name="password" type="password" autoComplete="new-password" minLength={8} required />
              </label>
              <label>
                Confirm new password
                <input name="password_confirmation" type="password" autoComplete="new-password" minLength={8} required />
              </label>
              {pwdError && <p className="pf-inline-error" role="alert">{pwdError}</p>}
              {pwdSuccess && <p className="pf-inline-success" role="status">{pwdSuccess}</p>}
              <div className="pf-modal-actions">
                <button type="button" className="pf-btn pf-btn-ghost pf-btn-sm" onClick={() => setShowPwd(false)}>Cancel</button>
                <button type="submit" className="pf-btn pf-btn-primary pf-btn-sm" disabled={pwdSaving}>
                  {pwdSaving ? 'Saving…' : 'Update password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
