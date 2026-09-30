import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Users,
  Search,
  ShieldCheck,
  Shield,
  UserCog,
  CircleDot,
  MoreVertical,
  Power,
  Lock,
} from 'lucide-react';
import './staff.css';

/* ===== SAMPLE STAFF DATA ===== */
/* Placeholder list until the Staffs tab is wired to the API. */
const INITIAL_STAFF = [
  { id: 1, name: 'Wrenz AJ Aquino', email: 'wrenzaj.aquino@cvsu.edu.ph', role: 'Super Admin', status: 'Active',   lastActive: 'Today · 08:42 AM' },
  { id: 2, name: 'Maria Santos',    email: 'maria.santos@cvsu.edu.ph',   role: 'Admin',       status: 'Active',   lastActive: 'Today · 07:15 AM' },
  { id: 3, name: 'Jomar Dela Cruz', email: 'jomar.delacruz@cvsu.edu.ph', role: 'Staff',       status: 'Active',   lastActive: 'Yesterday · 04:30 PM' },
  { id: 4, name: 'Ana Reyes',       email: 'ana.reyes@cvsu.edu.ph',      role: 'Staff',       status: 'Inactive', lastActive: '3 days ago' },
];

const ALL_ROLES = ['Staff', 'Admin', 'Super Admin'];

/* ===== ROLE VISUALS ===== */
const ROLE_META = {
  'Super Admin': { Icon: ShieldCheck, cls: 'st-role-super' },
  Admin:         { Icon: UserCog,     cls: 'st-role-admin' },
  Staff:         { Icon: Shield,      cls: 'st-role-staff' },
};

function Staffs({ currentRole = 'Super Admin' }) {
  const [staff, setStaff] = useState(INITIAL_STAFF);
  const [query, setQuery] = useState('');
  const [menu, setMenu] = useState(null); /* { id, top, left } */

  /* Only a Super Admin may promote / demote or change account state. */
  const isSuperAdmin = currentRole === 'Super Admin';

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return staff;
    return staff.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.email.toLowerCase().includes(q) ||
        s.role.toLowerCase().includes(q)
    );
  }, [query, staff]);

  const total = staff.length;
  const active = staff.filter((s) => s.status === 'Active').length;
  const admins = staff.filter(
    (s) => s.role === 'Admin' || s.role === 'Super Admin'
  ).length;

  /* Guard: never let the LAST active Super Admin be demoted or deactivated. */
  const superAdminCount = staff.filter((s) => s.role === 'Super Admin').length;
  const activeSuperAdmins = staff.filter(
    (s) => s.role === 'Super Admin' && s.status === 'Active'
  ).length;

  const roleOptionsFor = (s) => {
    let options = ALL_ROLES.filter((r) => r !== s.role);
    if (s.role === 'Super Admin' && superAdminCount <= 1) options = []; /* last one — locked */
    return options;
  };

  /* ===== MENU OPEN / CLOSE ===== */
  const openMenu = (e, s) => {
    e.stopPropagation();
    if (menu && menu.id === s.id) {
      setMenu(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const MENU_W = 200;
    /* Right-align the menu to the button, then clamp inside the viewport so
       it is never clipped on either edge (fixed-position avoids table overflow). */
    const left = Math.min(rect.right - MENU_W, window.innerWidth - MENU_W - 12);
    setMenu({ id: s.id, top: rect.bottom + 6, left: Math.max(12, left) });
  };

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onDown = (e) => {
      if (!e.target.closest('.st-action-menu') && !e.target.closest('.st-kebab')) {
        setMenu(null);
      }
    };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [menu]);

  /* ===== MOCK ACTIONS (local state only until wired to the API) ===== */
  const changeRole = (id, role) => {
    setStaff((prev) => prev.map((s) => (s.id === id ? { ...s, role } : s)));
    setMenu(null);
  };
  const toggleStatus = (id) => {
    setStaff((prev) =>
      prev.map((s) =>
        s.id === id
          ? { ...s, status: s.status === 'Active' ? 'Inactive' : 'Active' }
          : s
      )
    );
    setMenu(null);
  };

  const menuRow = menu ? staff.find((s) => s.id === menu.id) : null;

  return (
    <div className="st-root">
      {/* ===== KPI CARDS ===== */}
      <div className="st-kpi-row">
        <div className="st-kpi-card">
          <div className="st-kpi-icon"><Users size={18} /></div>
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
                {isSuperAdmin && <th className="st-th-actions">Actions</th>}
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
                    {isSuperAdmin && (
                      <td className="st-cell-actions">
                        <button
                          type="button"
                          className="st-kebab"
                          aria-label={`Manage ${s.name}`}
                          onClick={(e) => openMenu(e, s)}
                        >
                          <MoreVertical size={16} />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}

              {filtered.length === 0 && (
                <tr>
                  <td colSpan={isSuperAdmin ? 6 : 5} className="st-empty">
                    No staff match &ldquo;{query}&rdquo;.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ===== ROW ACTION MENU (Super Admin only, fixed-position) ===== */}
      {menu && menuRow && createPortal(
        <div
          className="st-action-menu"
          style={{ top: menu.top, left: Math.max(12, menu.left) }}
          role="menu"
        >
          <p className="st-menu-head">Change role</p>

          {roleOptionsFor(menuRow).map((r) => {
            const RIcon = (ROLE_META[r] || ROLE_META.Staff).Icon;
            return (
              <button
                key={r}
                type="button"
                className="st-menu-item"
                role="menuitem"
                onClick={() => changeRole(menuRow.id, r)}
              >
                <RIcon size={14} />
                Set as {r}
              </button>
            );
          })}

          {roleOptionsFor(menuRow).length === 0 && (
            <p className="st-menu-locked">
              <Lock size={12} />
              Last Super Admin — cannot demote
            </p>
          )}

          <div className="st-menu-divider" />

          {menuRow.role === 'Super Admin' &&
          menuRow.status === 'Active' &&
          activeSuperAdmins <= 1 ? (
            <p className="st-menu-locked">
              <Lock size={12} />
              Last Super Admin — cannot deactivate
            </p>
          ) : (
            <button
              type="button"
              className="st-menu-item"
              role="menuitem"
              onClick={() => toggleStatus(menuRow.id)}
            >
              <Power size={14} />
              {menuRow.status === 'Active' ? 'Deactivate account' : 'Activate account'}
            </button>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}

export default Staffs;
