import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { PageToast } from '../../utils/toast';
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
  Camera,
  Trash2,
  Eye,
  EyeOff,
  ShieldCheck,
} from 'lucide-react';
import OtpInput from '../Login/OtpInput';
import './profile.css';
/* The system's own confirm window (same look as Staffs → Account requests). */
import '../Staffs/staff.css';

/* ===== ROLE PERMISSIONS =====
   The Super Admin can always do everything. Admin and Staff see what the
   Super Admin turned on for them in Settings → Role Access (loaded from
   /api/role-access), grouped by page. */
const SUPER_ADMIN_PERMISSIONS = [
  'Full access to every page and feature',
  'Create, edit and deactivate accounts (Staffs)',
  'Choose what Admin and Staff can use (Settings → Role Access)',
  'Set the Safety Stock Policy and the system logo',
];

function permissionLines(access) {
  if (!access?.catalog || !access?.permissions) return [];
  const byGroup = new Map();
  access.catalog.forEach((feature) => {
    if (access.permissions[feature.key] !== true) return;
    if (!byGroup.has(feature.group)) byGroup.set(feature.group, []);
    byGroup.get(feature.group).push(feature.label);
  });
  return [
    'Dashboard, your profile and display settings',
    ...[...byGroup.entries()].map(([group, labels]) => `${group}: ${labels.join(', ')}`),
  ];
}

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

function ProfileSkeleton() {
  return (
    <div className="pf-root pf-loading" aria-busy="true" aria-label="Loading profile">
      <div className="pf-grid" aria-hidden="true">
        <section className="pf-card pf-area-identity">
          <span className="pf-skeleton pf-skeleton-avatar" />
          <div className="pf-skeleton-identity">
            <span className="pf-skeleton pf-skeleton-name" />
            <span className="pf-skeleton pf-skeleton-detail" />
            <span className="pf-skeleton pf-skeleton-role" />
          </div>
          <span className="pf-skeleton pf-skeleton-button" />
        </section>
        <section className="pf-card pf-area-details">
          <span className="pf-skeleton pf-skeleton-heading" />
          <span className="pf-skeleton pf-skeleton-detail" />
          <div className="pf-skeleton-fields">
            {Array.from({ length: 4 }, (_, index) => (
              <span className="pf-skeleton pf-skeleton-field" key={index} />
            ))}
          </div>
        </section>
        <section className="pf-card pf-area-permissions">
          <span className="pf-skeleton pf-skeleton-heading" />
          <span className="pf-skeleton pf-skeleton-detail" />
          {Array.from({ length: 4 }, (_, index) => (
            <span className="pf-skeleton pf-skeleton-permission" key={index} />
          ))}
        </section>
        <section className="pf-card pf-area-security">
          <span className="pf-skeleton pf-skeleton-heading" />
          <span className="pf-skeleton pf-skeleton-detail" />
          <span className="pf-skeleton pf-skeleton-security" />
        </section>
        <section className="pf-card pf-area-activity">
          <span className="pf-skeleton pf-skeleton-heading" />
          <span className="pf-skeleton pf-skeleton-detail" />
          {Array.from({ length: 3 }, (_, index) => (
            <span className="pf-skeleton pf-skeleton-activity" key={index} />
          ))}
        </section>
      </div>
      <p className="pf-skeleton-status" role="status">Loading profile…</p>
    </div>
  );
}

export default function Profile() {
  const [user, setUser] = useState(null);
  const [draft, setDraft] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saveError, setSaveError] = useState('');

  const [activity, setActivity] = useState([]);
  const [activityLoading, setActivityLoading] = useState(true);
  const [access, setAccess] = useState(null);   // Role Access for this account

  useEffect(() => {
    let active = true;
    fetch('/api/role-access', { headers: { Accept: 'application/json' }, cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => { if (active && body) setAccess(body); })
      .catch(() => { /* the card shows a short note instead */ });
    return () => { active = false; };
  }, []);

  /* ===== PASSWORD MODAL ===== */
  const [showPwd, setShowPwd] = useState(false);
  const [pwdError, setPwdError] = useState('');
  // 2026-11-16: Change Password security — typed values (for the rule chips),
  // show / hide each password, and the authenticator code.
  const [pwd, setPwd] = useState({ current: '', next: '', confirm: '' });
  const [pwdCode, setPwdCode] = useState('');
  const [pwdShown, setPwdShown] = useState({});
  const [pwdSuccess, setPwdSuccess] = useState('');
  const [pwdSaving, setPwdSaving] = useState(false);

  /* ===== CHANGE EMAIL: DOUBLE CONFIRMATION (2026-11-19) =====
     1 password (+ authenticator code) → 2 code from the CURRENT email →
     3 new email → 4 code from the NEW email. Nothing changes before step 4. */
  const EMAIL_FLOW_START = { step: 1, email: '', password: '', appCode: '', code: '', busy: false, error: '', info: '' };
  const [emailFlow, setEmailFlow] = useState(null);
  const [emailNotice, setEmailNotice] = useState('');
  const closeEmailFlow = () => setEmailFlow(null);
  const patchEmailFlow = (changes) => setEmailFlow((prev) => (prev ? { ...prev, ...changes } : prev));

  const firstError = (data, status) => (status === 429
    ? 'Too many tries. Wait a minute, then try again.'
    : (data.errors ? Object.values(data.errors).flat()[0] : data.message));

  /* One POST for every step; returns the reply, or null after showing the error. */
  const emailStep = async (url, body) => {
    patchEmailFlow({ busy: true, error: '' });
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-CSRF-TOKEN': csrf() },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = firstError(data, response.status) || `Something went wrong (${response.status}).`;
        // "Start again" errors send the person back to step 1.
        const restart = /Start again/i.test(message);
        patchEmailFlow({ busy: false, error: message, code: '', appCode: '', ...(restart ? { step: 1 } : {}) });
        return null;
      }
      return data;
    } catch {
      patchEmailFlow({ busy: false, error: 'Could not reach the server. Check your connection and try again.' });
      return null;
    }
  };

  const submitEmailStep = async (event) => {
    event.preventDefault();
    if (!emailFlow || emailFlow.busy) return;
    if (emailFlow.step === 1) {
      const data = await emailStep('/profile/email/start', {
        current_password: emailFlow.password,
        code: user?.twoFactorApp ? emailFlow.appCode : undefined,
      });
      if (data) patchEmailFlow({ step: 2, busy: false, code: '', appCode: '', password: '', info: data.message });
    } else if (emailFlow.step === 2) {
      const data = await emailStep('/profile/email/approve', { code: emailFlow.code });
      if (data) patchEmailFlow({ step: 3, busy: false, code: '', info: '' });
    } else if (emailFlow.step === 3) {
      const data = await emailStep('/profile/email/request', { email: emailFlow.email.trim() });
      if (data) patchEmailFlow({ step: 4, busy: false, code: '', info: data.message });
    } else {
      const data = await emailStep('/profile/email/confirm', { code: emailFlow.code });
      if (data) {
        setUser(data);
        setDraft(data);
        setEmailFlow(null);
        setEmailNotice(`Your email is now ${data.email}. Both your old and new email got a notice.`);
      }
    }
  };

  /* ===== OWN PROFILE PHOTO (separate from the system logo) ===== */
  const photoInputRef = useRef(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState('');

  const uploadPhoto = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { setPhotoError('Please choose an image file (JPG, PNG, WEBP or GIF).'); return; }
    if (file.size > 2 * 1024 * 1024) { setPhotoError('The picture must be 2 MB or smaller.'); return; }
    setPhotoBusy(true);
    setPhotoError('');
    try {
      const form = new FormData();
      form.append('avatar', file);
      const response = await fetch('/profile/avatar', {
        method: 'POST',
        headers: { Accept: 'application/json', 'X-CSRF-TOKEN': csrf() },
        credentials: 'same-origin',
        body: form,
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(Object.values(body?.errors || {}).flat()[0] || body?.message || 'The photo could not be saved.');
      setUser((prev) => ({ ...prev, avatarUrl: body.avatarUrl }));
      // Tell the sidebar account row to show the new photo right away.
      window.dispatchEvent(new CustomEvent('ggg-avatar-changed', { detail: body.avatarUrl || null }));
    } catch (e) {
      setPhotoError(e.message || 'The photo could not be saved.');
    } finally {
      setPhotoBusy(false);
    }
  };

  /* 2026-11-11: "Remove photo" asks first in the system's own confirm window. */
  const [confirmRemove, setConfirmRemove] = useState(false);

  const removePhoto = async () => {
    setConfirmRemove(false);
    setPhotoBusy(true);
    setPhotoError('');
    try {
      const response = await fetch('/profile/avatar', {
        method: 'DELETE',
        headers: { Accept: 'application/json', 'X-CSRF-TOKEN': csrf() },
        credentials: 'same-origin',
      });
      if (!response.ok) throw new Error('The photo could not be removed.');
      setUser((prev) => ({ ...prev, avatarUrl: null }));
      window.dispatchEvent(new CustomEvent('ggg-avatar-changed', { detail: null }));
    } catch (e) {
      setPhotoError(e.message || 'The photo could not be removed.');
    } finally {
      setPhotoBusy(false);
    }
  };

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
    // A new email is confirmed in its own pop-up (2026-11-19); Save keeps the current one.
    const newEmail = String(draft.email || '').trim();
    const emailChanged = newEmail !== '' && newEmail.toLowerCase() !== String(user.email || '').trim().toLowerCase();
    if (emailChanged && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
      setSaveError('Enter a valid email address.');
      return;
    }
    try {
      const response = await fetch('/profile', {
        method: 'PATCH',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-CSRF-TOKEN': csrf() },
        body: JSON.stringify({ name: draft.fullName, email: user.email, department: draft.department }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const msg = data.errors ? Object.values(data.errors).flat()[0] : data.message;
        throw new Error(msg || `Save failed (${response.status}).`);
      }
      setUser(data);
      setDraft(data);
      setIsEditing(false);
      if (emailChanged) setEmailFlow({ ...EMAIL_FLOW_START, email: newEmail });
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
          code: user?.twoFactorApp ? pwdCode : undefined,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (data.errors?.code) setPwdCode('');
        const msg = response.status === 429
          ? 'Too many tries. Wait a minute, then try again.'
          : data.errors ? Object.values(data.errors).flat()[0] : data.message;
        throw new Error(msg || `Could not change password (${response.status}).`);
      }
      setPwdSuccess(data.message || 'Your password has been updated.');
      event.target.reset();
      setPwd({ current: '', next: '', confirm: '' });
      setPwdCode('');
      setPwdShown({});
      setTimeout(() => { setShowPwd(false); setPwdSuccess(''); }, 1600);
    } catch (e) {
      setPwdError(e.message || 'Could not change the password.');
    } finally {
      setPwdSaving(false);
    }
  };

  const permissions = useMemo(() => {
    if (!user) return [];
    if (user.role === 'Super Admin') return SUPER_ADMIN_PERMISSIONS;
    return permissionLines(access);
  }, [user, access]);

  if (loading) return <ProfileSkeleton />;
  if (error) return <div className="pf-root"><p className="pf-sub" role="alert">{error}</p></div>;
  if (!user) return null;

  return (
    <div className="pf-root">
      <div className="pf-grid">

        {/* ===== IDENTITY ===== */}
        <section className="pf-card pf-area-identity">
          <div className="pf-avatar-wrap">
            <div className="pf-avatar">
              {user.avatarUrl
                ? <img src={user.avatarUrl} alt="" />
                : initialsOf(user.fullName)}
            </div>
            <button
              type="button"
              className="pf-avatar-edit"
              onClick={() => photoInputRef.current?.click()}
              disabled={photoBusy}
              title={user.avatarUrl ? 'Change your photo' : 'Add your photo'}
              aria-label="Change your profile photo"
            >
              <Camera size={12} />
            </button>
            <input
              ref={photoInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={uploadPhoto}
              hidden
            />
          </div>
          <div className="pf-identity-text">
            <h2>{user.fullName}</h2>
            <p className="pf-sub">{user.email}{user.department ? ` · ${user.department}` : ''}</p>
            {user.avatarUrl && (
              <button type="button" className="pf-photo-remove" onClick={() => setConfirmRemove(true)} disabled={photoBusy}>
                <Trash2 size={12} aria-hidden="true" /> Remove photo
              </button>
            )}
            {confirmRemove && createPortal(
              <div
                className="st-modal-overlay st-account-confirm-overlay"
                onMouseDown={(event) => { if (event.target === event.currentTarget) setConfirmRemove(false); }}
                onKeyDown={(event) => { if (event.key === 'Escape') setConfirmRemove(false); }}
              >
                <section className="st-modal st-account-confirm" role="dialog" aria-modal="true" aria-labelledby="pf-remove-photo-title">
                  <header className="st-modal-header">
                    <div>
                      <p className="st-modal-eyebrow">Profile photo</p>
                      <h2 id="pf-remove-photo-title">Remove your photo?</h2>
                    </div>
                    <button type="button" className="st-modal-close" aria-label="Close confirmation" onClick={() => setConfirmRemove(false)}>
                      <X size={18} />
                    </button>
                  </header>
                  <div className="st-account-confirm-body">
                    <p>The default picture will show instead, here and in the sidebar. You can upload a new photo any time.</p>
                    <div className="st-account-confirm-identity">
                      <span>{user.fullName}</span>
                      <span>{user.email}</span>
                    </div>
                  </div>
                  <footer className="st-account-confirm-actions">
                    <button type="button" className="st-confirm-cancel" onClick={() => setConfirmRemove(false)} autoFocus>Keep photo</button>
                    <button type="button" className="st-confirm-danger" onClick={removePhoto}>Remove photo</button>
                  </footer>
                </section>
              </div>,
              document.body,
            )}
            <PageToast message={photoError} type="error" onShown={() => setPhotoError('')} />
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
          <p className="pf-sub hint-text">Contact information tied to this account</p>

          <PageToast message={saveError} type="error" onShown={() => setSaveError('')} />
          <PageToast message={emailNotice} type="success" onShown={() => setEmailNotice('')} />

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
          <p className="pf-sub hint-text">
            {user.role === 'Super Admin'
              ? 'What the Super Admin can do in this system'
              : `What your ${user.role} account can use — set by the Super Admin in Settings → Role Access`}
          </p>
          {permissions.length === 0 && <p className="pf-sub">Loading your permissions…</p>}
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
          <p className="pf-sub hint-text">Keep this account protected</p>
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
          <p className="pf-sub hint-text">Actions recorded under this account</p>
          <div className="pf-scroll">
            {activityLoading ? (
              <div className="pf-activity-skeleton" aria-busy="true" aria-label="Loading activity">
                {Array.from({ length: 3 }, (_, index) => (
                  <span className="pf-skeleton pf-skeleton-activity" key={index} />
                ))}
              </div>
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

      {/* ===== CHANGE EMAIL MODAL (2026-11-19): double confirmation ===== */}
      {emailFlow && createPortal(
        <div className="pf-modal-overlay" onClick={closeEmailFlow}>
          <div className="pf-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="pf-email-title">
            <div className="pf-modal-header">
              <h3 id="pf-email-title">
                <Mail size={16} />{' '}
                {['Confirm it\'s you', 'Approve from your current email', 'Type your new email', 'Check your new email'][emailFlow.step - 1]}
              </h3>
              <button type="button" className="pf-btn pf-btn-ghost pf-btn-sm" onClick={closeEmailFlow} aria-label="Close"><X size={16} /></button>
            </div>
            <form className="pf-pwd-form" onSubmit={submitEmailStep}>
              <div className="pf-email-steps" aria-hidden="true">
                {[1, 2, 3, 4].map((n) => (
                  <span key={n} className={`pf-email-dot${n < emailFlow.step ? ' is-done' : ''}${n === emailFlow.step ? ' is-now' : ''}`} />
                ))}
              </div>
              <p className="pf-sub pf-email-step">
                Step {emailFlow.step} of 4 ·{' '}
                {emailFlow.step === 1 && <>To change your email, first confirm it's you.</>}
                {emailFlow.step === 2 && <>{emailFlow.info} Type it to approve the change. It expires in 10 minutes.</>}
                {emailFlow.step === 3 && <>Approved by <strong>{user.email}</strong>. Now type the email you want to use.</>}
                {emailFlow.step === 4 && <>{emailFlow.info} Type it to finish. It expires in 10 minutes.</>}
              </p>

              {emailFlow.step === 1 && (
                <>
                  <label>
                    Current password
                    <span className="pf-pwd-input">
                      <input
                        type="password"
                        autoComplete="current-password"
                        required
                        autoFocus
                        value={emailFlow.password}
                        onChange={(event) => patchEmailFlow({ password: event.target.value })}
                      />
                    </span>
                  </label>
                  {user?.twoFactorApp && (
                    <div className="pf-pwd-code">
                      <span className="pf-pwd-code-label">6-digit code from your authenticator app</span>
                      <OtpInput value={emailFlow.appCode} onChange={(value) => patchEmailFlow({ appCode: value })} autoFocus={false} idPrefix="pf-email-app-code" label="6-digit code from your authenticator app" />
                    </div>
                  )}
                </>
              )}

              {(emailFlow.step === 2 || emailFlow.step === 4) && (
                <div className="pf-pwd-code">
                  <span className="pf-pwd-code-label">6-digit code from {emailFlow.step === 2 ? 'your current email' : 'your new email'}</span>
                  <OtpInput
                    key={emailFlow.step}
                    value={emailFlow.code}
                    onChange={(value) => patchEmailFlow({ code: value })}
                    idPrefix={`pf-email-code-${emailFlow.step}`}
                    label={`6-digit code from ${emailFlow.step === 2 ? 'your current email' : 'your new email'}`}
                  />
                </div>
              )}

              {emailFlow.step === 3 && (
                <label>
                  New email
                  <span className="pf-pwd-input">
                    <input
                      type="email"
                      autoComplete="email"
                      required
                      autoFocus
                      value={emailFlow.email}
                      onChange={(event) => patchEmailFlow({ email: event.target.value })}
                    />
                  </span>
                </label>
              )}

              <p className="pf-pwd-note hint-text">
                <ShieldCheck size={14} aria-hidden="true" />
                <span>
                  {emailFlow.step === 2
                    ? <>Can't open your current email? <strong>Ask the Super Admin</strong> to change it for you in Staffs.</>
                    : emailFlow.step === 4
                      ? <>Didn't get it? Check spam, or go <strong>Back</strong> to fix the address.</>
                      : <>Your email stays the same until the <strong>last step</strong>.</>}
                </span>
              </p>
              <PageToast message={emailFlow.error} type="error" onShown={() => patchEmailFlow({ error: '' })} />
              <div className="pf-modal-actions">
                {emailFlow.step === 4
                  ? <button type="button" className="pf-btn pf-btn-ghost pf-btn-sm" onClick={() => patchEmailFlow({ step: 3, error: '', code: '' })}>Back</button>
                  : <button type="button" className="pf-btn pf-btn-ghost pf-btn-sm" onClick={closeEmailFlow}>Cancel</button>}
                <button
                  type="submit"
                  className="pf-btn pf-btn-primary pf-btn-sm"
                  disabled={emailFlow.busy
                    || (emailFlow.step === 1 && (!emailFlow.password || (user?.twoFactorApp && emailFlow.appCode.length !== 6)))
                    || ((emailFlow.step === 2 || emailFlow.step === 4) && emailFlow.code.length !== 6)
                    || (emailFlow.step === 3 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailFlow.email.trim()))}
                >
                  {emailFlow.busy ? 'Please wait…' : ['Send code to my email', 'Approve', 'Send code to new email', 'Change email'][emailFlow.step - 1]}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body,
      )}

      {/* ===== CHANGE PASSWORD MODAL ===== */}
      {/* 2026-11-12: drawn on the page body so it is always centred on phones. */}
      {showPwd && createPortal(
        <div className="pf-modal-overlay" onClick={() => setShowPwd(false)}>
          <div className="pf-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="pf-modal-header">
              <h3><KeyRound size={16} /> Change Password</h3>
              <button type="button" className="pf-btn pf-btn-ghost pf-btn-sm" onClick={() => setShowPwd(false)} aria-label="Close"><X size={16} /></button>
            </div>
            <form className="pf-pwd-form" onSubmit={changePassword}>
              {[
                { key: 'current', name: 'current_password', label: 'Current password', auto: 'current-password' },
                { key: 'next', name: 'password', label: 'New password', auto: 'new-password' },
                { key: 'confirm', name: 'password_confirmation', label: 'Confirm new password', auto: 'new-password' },
              ].map((field) => (
                <label key={field.key}>
                  {field.label}
                  <span className="pf-pwd-input">
                    <input
                      name={field.name}
                      type={pwdShown[field.key] ? 'text' : 'password'}
                      autoComplete={field.auto}
                      minLength={field.key === 'current' ? undefined : 8}
                      required
                      value={pwd[field.key]}
                      onChange={(event) => {
                        const value = field.key === 'current' ? event.target.value : event.target.value.replace(/\s/g, '');
                        setPwd((prev) => ({ ...prev, [field.key]: value }));
                      }}
                    />
                    <button
                      type="button"
                      className="pf-pwd-eye"
                      onClick={() => setPwdShown((prev) => ({ ...prev, [field.key]: !prev[field.key] }))}
                      aria-label={pwdShown[field.key] ? `Hide ${field.label.toLowerCase()}` : `Show ${field.label.toLowerCase()}`}
                      title={pwdShown[field.key] ? 'Hide' : 'Show'}
                    >
                      {pwdShown[field.key] ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </span>
                  {field.key === 'next' && (
                    <span className="pf-pwd-rules" aria-live="polite">
                      {[
                        { ok: pwd.next.length >= 8, text: '8+ characters', must: true },
                        { ok: pwd.next.length > 0 && !/\s/.test(pwd.next), text: 'No spaces', must: true },
                        { ok: pwd.next.length > 0 && pwd.next !== pwd.current, text: 'Not the same as now', must: true },
                        { ok: /\d/.test(pwd.next), text: 'A number' },
                        { ok: /[^A-Za-z0-9\s]/.test(pwd.next), text: 'A special character like ! or #' },
                      ].map((rule) => (
                        <span key={rule.text} className={`pf-pwd-rule${rule.ok ? ' is-ok' : ''}${rule.must ? '' : ' is-tip'}`}>
                          {rule.ok && <Check size={11} aria-hidden="true" />} {rule.text}
                        </span>
                      ))}
                    </span>
                  )}
                  {field.key === 'confirm' && pwd.confirm && (
                    <span className={`pf-pwd-match${pwd.confirm === pwd.next ? ' is-ok' : ' is-bad'}`}>
                      {pwd.confirm === pwd.next ? <><Check size={12} aria-hidden="true" /> Passwords match</> : 'Passwords do not match yet'}
                    </span>
                  )}
                </label>
              ))}
              {user?.twoFactorApp && (
                <div className="pf-pwd-code">
                  <span className="pf-pwd-code-label">6-digit code from your authenticator app</span>
                  <OtpInput value={pwdCode} onChange={setPwdCode} autoFocus={false} idPrefix="pf-pwd-code" label="6-digit code from your authenticator app" />
                </div>
              )}
              <p className="pf-pwd-note hint-text">
                <ShieldCheck size={14} aria-hidden="true" />
                <span>After saving, you stay signed in here but are <strong>signed out on all other devices</strong>, and we email you a notice.</span>
              </p>
              <PageToast message={pwdError} type="error" onShown={() => setPwdError('')} />
              <PageToast message={pwdSuccess} type="success" onShown={() => setPwdSuccess('')} />
              <div className="pf-modal-actions">
                <button type="button" className="pf-btn pf-btn-ghost pf-btn-sm" onClick={() => setShowPwd(false)}>Cancel</button>
                <button
                  type="submit"
                  className="pf-btn pf-btn-primary pf-btn-sm"
                  disabled={pwdSaving
                    || pwd.next.length < 8
                    || pwd.next !== pwd.confirm
                    || pwd.next === pwd.current
                    || (user?.twoFactorApp && pwdCode.length !== 6)}
                >
                  {pwdSaving ? 'Saving…' : 'Update password'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
