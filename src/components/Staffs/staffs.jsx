import React, { useMemo, useState } from 'react';
import {
  Search,
  ShieldCheck,
  Shield,
  UserCog,
  CircleDot,
  UsersRound
} from 'lucide-react';
import './staff.css';

/* ===== SAMPLE STAFF DATA ===== */
/* Placeholder list until the Staffs tab is wired to the API. */
const SAMPLE_STAFF = [
  { id: 1, name: 'Wrenz AJ Aquino', email: 'wrenzaj.aquino@cvsu.edu.ph', role: 'Super Admin', status: 'Active',   lastActive: 'Today · 08:42 AM' },
  { id: 2, name: 'Maria Santos',    email: 'maria.santos@cvsu.edu.ph',   role: 'Admin',       status: 'Active',   lastActive: 'Today · 07:15 AM' },
  { id: 3, name: 'Jomar Dela Cruz', email: 'jomar.delacruz@cvsu.edu.ph', role: 'Staff',       status: 'Active',   lastActive: 'Yesterday · 04:30 PM' },
  { id: 4, name: 'Ana Reyes',       email: 'ana.reyes@cvsu.edu.ph',      role: 'Staff',       status: 'Inactive', lastActive: '3 days ago' },
];

/* ===== ROLE VISUALS ===== */
const ROLE_META = {
  'Super Admin': { Icon: ShieldCheck, cls: 'st-role-super' },
  Admin:         { Icon: UserCog,     cls: 'st-role-admin' },
  Staff:         { Icon: Shield,      cls: 'st-role-staff' },
};

function Staffs() {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SAMPLE_STAFF;
    return SAMPLE_STAFF.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.email.toLowerCase().includes(q) ||
        s.role.toLowerCase().includes(q)
    );
  }, [query]);

  const total = SAMPLE_STAFF.length;
  const active = SAMPLE_STAFF.filter((s) => s.status === 'Active').length;
  const admins = SAMPLE_STAFF.filter(
    (s) => s.role === 'Admin' || s.role === 'Super Admin'
  ).length;

  return (
    <div className="st-root">
      {/* ===== KPI CARDS ===== */}
      <div className="st-kpi-row">
        <div className="st-kpi-card">
          <div className="st-kpi-icon"><UsersRound size={18} /></div>
          <div>
            <p className="st-kpi-value">{total}</p>
            <p className="st-kpi-label">Total staff</p>
          </div>
        </div>
        <div className="st-kpi-card">
          <div className="st-kpi-icon st-kpi-icon-green"><CircleDot size={18} /></div>
          <div>
            <p className="st-kpi-value">{active}</p>
            <p className="st-kpi-label">Active</p>
          </div>
        </div>
        <div className="st-kpi-card">
          <div className="st-kpi-icon st-kpi-icon-gold"><ShieldCheck size={18} /></div>
          <div>
            <p className="st-kpi-value">{admins}</p>
            <p className="st-kpi-label">Admins &amp; up</p>
          </div>
        </div>
      </div>

      {/* ===== SEARCH ===== */}
      <div className="st-controls-bar">
        <div className="st-search-box">
          <Search size={16} className="st-search-icon" />
          <input
            type="text"
            className="st-search-input"
            placeholder="Search staff by name, email or role…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      {/* ===== STAFF TABLE ===== */}
      <div className="st-table-card">
        <div className="st-table-scroll">
          <table className="st-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Last active</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => {
                const role = ROLE_META[s.role] || ROLE_META.Staff;
                const RoleIcon = role.Icon;
                return (
                  <tr key={s.id}>
                    <td className="st-cell-name">{s.name}</td>
                    <td className="st-cell-muted">{s.email}</td>
                    <td>
                      <span className={`st-role-badge ${role.cls}`}>
                        <RoleIcon size={12} />
                        {s.role}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`st-status ${
                          s.status === 'Active' ? 'st-status-on' : 'st-status-off'
                        }`}
                      >
                        {s.status}
                      </span>
                    </td>
                    <td className="st-cell-muted">{s.lastActive}</td>
                  </tr>
                );
              })}

              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="st-empty">
                    No staff match &ldquo;{query}&rdquo;.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default Staffs;
