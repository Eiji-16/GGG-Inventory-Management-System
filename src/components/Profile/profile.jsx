import React, { useState } from 'react';
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
} from 'lucide-react';
import './profile.css';

/* Sample account record — replace with the Firebase `users/{uid}` document. */
const SAMPLE_USER = {
  fullName: 'Wrenz AJ Aquino',
  username: 'wrenzaj',
  email: 'wrenzaj.aquino@cvsu.edu.ph',
  role: 'Super Admin',
  department: 'Inventory Operations',
  joined: 'January 12, 2026',
  lastLogin: 'Today · 08:42 AM',
};

/* What each role is allowed to do. Drives the permissions card. */
const ROLE_MATRIX = {
  'Super Admin': [
    'Full access to every module',
    'Create, edit and deactivate Admin accounts',
    'Manage products, suppliers and stock movements',
    'Add or remove custom formulas in Auto Calculator',
    'Export and archive all reports',
  ],
  Admin: [
    'Record stock in / stock out movements',
    'Run Auto Calculator and Sales Forecasting',
    'View and export reports',
    'No access to user account management',
  ],
};

/* Recent actions attributed to this user. Sourced from stock movement records. */
const RECENT_ACTIVITY = [
  { icon: Boxes, label: 'Recorded stock out — 12 units', meta: 'Precision Steel Chronograph · 2h ago' },
  { icon: TrendingUp, label: 'Computed forecast — next month', meta: 'Weighted Moving Average · 5h ago' },
  { icon: Calculator, label: 'Computed EOQ — 148 units', meta: 'Sapphire Crystal Glass Face · Yesterday' },
  { icon: Boxes, label: 'Recorded stock in — 60 units', meta: 'Water-Resistant Diver Strap · Yesterday' },
];

const initialsOf = (name) =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');

export default function Profile() {
  const [user, setUser] = useState(SAMPLE_USER);
  const [draft, setDraft] = useState(SAMPLE_USER);
  const [isEditing, setIsEditing] = useState(false);

  const startEdit = () => {
    setDraft(user);
    setIsEditing(true);
  };

  const cancelEdit = () => {
    setDraft(user);
    setIsEditing(false);
  };

  const saveEdit = () => {
    setUser(draft);
    setIsEditing(false);
  };

  const setField = (key) => (e) =>
    setDraft((prev) => ({ ...prev, [key]: e.target.value }));

  const permissions = ROLE_MATRIX[user.role] ?? [];

  return (
    <div className="pf-root">
      <div className="pf-grid">

        {/* ── 1 · IDENTITY ────────────────────────────────────── */}
        <section className="pf-card pf-area-identity">
          <div className="pf-avatar">{initialsOf(user.fullName)}</div>
          <div className="pf-identity-text">
            <h2>{user.fullName}</h2>
            <p className="pf-sub">@{user.username} · {user.department}</p>
            <span className={`pf-role-pill pf-role-${user.role.replace(/\s+/g, '')}`}>
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

        {/* ── 2 · ACCOUNT DETAILS ─────────────────────────────── */}
        <section className="pf-card pf-area-details">
          <h3>Account Details</h3>
          <p className="pf-sub">Contact information tied to this account</p>

          <div className="pf-field-grid">
            <div className="pf-field">
              <label htmlFor="pf-fullName"><User size={12} /> Full name</label>
              {isEditing ? (
                <input id="pf-fullName" type="text" value={draft.fullName} onChange={setField('fullName')} />
              ) : (
                <div className="pf-value">{user.fullName}</div>
              )}
            </div>

            <div className="pf-field">
              <label htmlFor="pf-email"><Mail size={12} /> Email address</label>
              {isEditing ? (
                <input id="pf-email" type="email" value={draft.email} onChange={setField('email')} />
              ) : (
                <div className="pf-value">{user.email}</div>
              )}
            </div>

            <div className="pf-field">
              <label htmlFor="pf-department"><Boxes size={12} /> Department</label>
              {isEditing ? (
                <input id="pf-department" type="text" value={draft.department} onChange={setField('department')} />
              ) : (
                <div className="pf-value">{user.department}</div>
              )}
            </div>

            <div className="pf-field">
              <label htmlFor="pf-role"><Shield size={12} /> Role</label>
              {isEditing ? (
                <select id="pf-role" value={draft.role} onChange={setField('role')}>
                  <option>Super Admin</option>
                  <option>Admin</option>
                </select>
              ) : (
                <div className="pf-value">{user.role}</div>
              )}
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

        {/* ── 3 · ROLE & PERMISSIONS ──────────────────────────── */}
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

        {/* ── 4 · SECURITY ────────────────────────────────────── */}
        <section className="pf-card pf-area-security">
          <h3>Security</h3>
          <p className="pf-sub">Keep this account protected</p>
          <div className="pf-security-row">
            <div className="pf-row-icon"><KeyRound size={15} /></div>
            <div className="pf-row-text">
              <div className="pf-row-title">Password</div>
              <div className="pf-sub">Last changed 42 days ago</div>
            </div>
            <button type="button" className="pf-btn pf-btn-ghost pf-btn-sm">Change</button>
          </div>
        </section>

        {/* ── 5 · RECENT ACTIVITY ─────────────────────────────── */}
        <section className="pf-card pf-area-activity">
          <h3>Recent Activity</h3>
          <p className="pf-sub">Actions recorded under this account</p>
          <div className="pf-scroll">
            <ul className="pf-activity-list">
              {RECENT_ACTIVITY.map((row) => {
                const Icon = row.icon;
                return (
                  <li key={row.label}>
                    <div className="pf-row-icon"><Icon size={14} /></div>
                    <div className="pf-row-text">
                      <div className="pf-row-title">{row.label}</div>
                      <div className="pf-sub">{row.meta}</div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

      </div>
    </div>
  );
}
