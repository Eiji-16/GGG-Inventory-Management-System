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
  X,
  Archive,
  UserRoundPlus,
  Trash2,
} from 'lucide-react';
import './staff.css';
import { uiZoom } from '../../fontSize';

const ALL_ROLES = ['Staff', 'Admin', 'Super Admin'];

/* Map the display role label the UI uses to the backend role value. */
const ROLE_TO_API = { 'Super Admin': 'super_admin', Admin: 'admin', Staff: 'staff' };

const csrf = () => document.querySelector('meta[name="csrf-token"]')?.content || '';

/* ===== ROLE VISUALS ===== */
const ROLE_META = {
  'Super Admin': { Icon: ShieldCheck, cls: 'st-role-super' },
  Admin:         { Icon: UserCog,     cls: 'st-role-admin' },
  Staff:         { Icon: Shield,      cls: 'st-role-staff' },
};

function Staffs({ isSuperAdmin = false }) {
  const [staff, setStaff] = useState([]);
  const [deactivatedStaff, setDeactivatedStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [query, setQuery] = useState('');
  const [menu, setMenu] = useState(null); /* { id, top, left } */
  const [accountDialog, setAccountDialog] = useState(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [accountActionError, setAccountActionError] = useState('');
  const [isAccountActionLoading, setIsAccountActionLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDeactivated, setShowDeactivated] = useState(false);
  const [createError, setCreateError] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  /* ===== LOAD STAFF FROM API ===== */
  const refreshStaff = async () => {
    setLoadError('');
    const [activeResponse, inactiveResponse] = await Promise.all([
      fetch('/staff', { headers: { Accept: 'application/json' } }),
      fetch('/staff?status=inactive', { headers: { Accept: 'application/json' } }),
    ]);
    if (!activeResponse.ok || !inactiveResponse.ok) {
      const failedResponse = !activeResponse.ok ? activeResponse : inactiveResponse;
      throw new Error(`Could not load staff (${failedResponse.status}).`);
    }
    const [activeAccounts, inactiveAccounts] = await Promise.all([
      activeResponse.json(),
      inactiveResponse.json(),
    ]);
    setStaff(Array.isArray(activeAccounts) ? activeAccounts : []);
    setDeactivatedStaff(Array.isArray(inactiveAccounts) ? inactiveAccounts : []);
  };

  useEffect(() => {
    refreshStaff()
      .catch((err) => setLoadError(err.message || 'Could not load staff.'))
      .finally(() => setLoading(false));
  }, []);

  const visibleAccounts = showDeactivated ? deactivatedStaff : staff;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return visibleAccounts;
    return visibleAccounts.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.email.toLowerCase().includes(q) ||
        s.role.toLowerCase().includes(q)
    );
  }, [query, visibleAccounts]);

  const allAccounts = [...staff, ...deactivatedStaff];
  const total = allAccounts.length;
  const active = staff.filter((s) => s.status === 'Active').length;
  const admins = allAccounts.filter(
    (s) => s.role === 'Admin' || s.role === 'Super Admin'
  ).length;

  /* Guard: never let the LAST active Super Admin be demoted or deactivated. */
  const superAdminCount = allAccounts.filter((s) => s.role === 'Super Admin').length;
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
    // Screen sizes ÷ zoom = page pixels (Settings → Font size).
    const zoom = uiZoom();
    const box = e.currentTarget.getBoundingClientRect();
    const rect = { right: box.right / zoom, bottom: box.bottom / zoom };
    const MENU_W = 200;
    /* Right-align the menu to the button, then clamp inside the viewport so
       it is never clipped on either edge (fixed-position avoids table overflow). */
    const left = Math.min(rect.right - MENU_W, window.innerWidth / zoom - MENU_W - 12);
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

  /* ===== PATCH a staff member (role and/or status) ===== */
  const patchStaff = async (id, body) => {
    setActionError('');
    setActionMessage('');
    setMenu(null);
    try {
      const response = await fetch(`/staff/${id}`, {
        method: 'PATCH',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-CSRF-TOKEN': csrf(),
        },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const msg = data.errors ? Object.values(data.errors).flat()[0] : data.message;
        throw new Error(msg || `Update failed (${response.status}).`);
      }
      if (data.status === 'Active' && deactivatedStaff.some((account) => account.id === id)) {
        setShowDeactivated(false);
      }
      setStaff((previous) => (
        data.status === 'Active'
          ? [...previous.filter((account) => account.id !== id), data]
            .sort((a, b) => a.name.localeCompare(b.name))
          : previous.filter((account) => account.id !== id)
      ));
      setDeactivatedStaff((previous) => (
        data.status === 'Active'
          ? previous.filter((account) => account.id !== id)
          : [...previous.filter((account) => account.id !== id), data]
            .sort((a, b) => a.name.localeCompare(b.name))
      ));
    } catch (err) {
      setActionError(err.message || 'Could not update the account.');
    }
  };

  const changeRole = (id, role) => patchStaff(id, { role: ROLE_TO_API[role] });
  const toggleStatus = (id) => {
    const row = allAccounts.find((s) => s.id === id);
    if (!row) return;
    patchStaff(id, { status: row.status === 'Active' ? 'inactive' : 'active' });
  };

  useEffect(() => {
    if (!showCreateModal && !accountDialog) return undefined;
    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event) => {
      if (event.key === 'Escape' && !isAccountActionLoading) {
        closeAccountDialog();
      }
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [showCreateModal, accountDialog, isAccountActionLoading]);

  const closeAccountDialog = () => {
    setAccountDialog(null);
    setDeleteConfirmation('');
    setAccountActionError('');
  };

  const openAccountDialog = (step, account) => {
    setMenu(null);
    setAccountActionError('');
    setDeleteConfirmation('');
    setAccountDialog({ step, account });
  };

  const confirmReactivate = async () => {
    if (!accountDialog || isAccountActionLoading) return;
    setIsAccountActionLoading(true);
    setAccountActionError('');
    try {
      const account = accountDialog.account;
      const response = await fetch(`/staff/${account.id}`, {
        method: 'PATCH',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-CSRF-TOKEN': csrf(),
        },
        body: JSON.stringify({ status: 'active' }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = data.errors ? Object.values(data.errors).flat()[0] : data.message;
        throw new Error(message || `Could not reactivate account (${response.status}).`);
      }

      setStaff((previous) => (
        [...previous.filter((item) => item.id !== account.id), data]
          .sort((a, b) => a.name.localeCompare(b.name))
      ));
      setDeactivatedStaff((previous) => previous.filter((item) => item.id !== account.id));
      setShowDeactivated(false);
      setActionError('');
      setActionMessage(`${data.name}'s account has been reactivated.`);
      closeAccountDialog();
    } catch (error) {
      setAccountActionError(error.message || 'Could not reactivate the account.');
    } finally {
      setIsAccountActionLoading(false);
    }
  };

  const confirmPermanentDelete = async () => {
    if (
      !accountDialog ||
      accountDialog.step !== 'delete-final' ||
      deleteConfirmation !== 'DELETE' ||
      isAccountActionLoading
    ) return;

    setIsAccountActionLoading(true);
    setAccountActionError('');
    try {
      const { account } = accountDialog;
      const response = await fetch(`/staff/${account.id}`, {
        method: 'DELETE',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-CSRF-TOKEN': csrf(),
        },
        body: JSON.stringify({ confirmation: deleteConfirmation }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = data.errors ? Object.values(data.errors).flat()[0] : data.message;
        throw new Error(message || `Could not delete account (${response.status}).`);
      }

      setDeactivatedStaff((previous) => previous.filter((item) => item.id !== account.id));
      setActionError('');
      setActionMessage(`${account.name}'s account has been permanently deleted.`);
      closeAccountDialog();
    } catch (error) {
      setAccountActionError(error.message || 'Could not permanently delete the account.');
    } finally {
      setIsAccountActionLoading(false);
    }
  };

  const createAccount = async (event) => {
    event.preventDefault();
    setCreateError('');
    setIsCreating(true);

    const formElement = event.currentTarget;
    const formData = new FormData(formElement);

    try {
      const response = await fetch('/staff', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-CSRF-TOKEN': csrf(),
        },
        body: JSON.stringify({
          name: formData.get('name'),
          email: formData.get('email'),
          password: formData.get('password'),
          password_confirmation: formData.get('password_confirmation'),
          role: formData.get('role') || 'staff',
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        const validationMessage = data.errors
          ? Object.values(data.errors).flat()[0]
          : null;
        setCreateError(validationMessage || data.message || 'Could not create the account.');
        return;
      }

      setStaff((previous) => [...previous, data].sort((a, b) => a.name.localeCompare(b.name)));
      formElement.reset();
      setShowDeactivated(false);
      setShowCreateModal(false);
    } catch (error) {
      console.error('Account creation request failed:', error);
      setCreateError('Could not reach the server. Please try again.');
    } finally {
      setIsCreating(false);
    }
  };

  const menuRow = menu ? allAccounts.find((s) => s.id === menu.id) : null;

  return (
    <div className="st-root">
      {(loadError || actionError) && (
        <div className="st-create-account-error" role="alert" style={{ marginBottom: 12 }}>
          {loadError || actionError}
        </div>
      )}
      {actionMessage && (
        <div className="st-action-success" role="status">
          {actionMessage}
          <button type="button" aria-label="Dismiss message" onClick={() => setActionMessage('')}>
            <X size={14} />
          </button>
        </div>
      )}

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
            placeholder={`Search ${showDeactivated ? 'deactivated ' : ''}staff by name, email or role…`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="st-controls-actions">
          {isSuperAdmin && !showDeactivated && (
            <button
              type="button"
              className="st-create-account-button"
              onClick={() => {
                setCreateError('');
                setShowCreateModal(true);
              }}
            >
              <UserRoundPlus size={15} />
              Create Staff Account
            </button>
          )}
          {isSuperAdmin && (
            <button
              type="button"
              className="st-deactivated-button"
              onClick={() => {
                setMenu(null);
                setQuery('');
                setShowDeactivated((shown) => !shown);
              }}
            >
              {showDeactivated ? <Users size={15} /> : <Archive size={15} />}
              {showDeactivated ? 'Active Accounts' : 'Deactivated Accounts'}
              {!showDeactivated && deactivatedStaff.length > 0 && (
                <span className="st-deactivated-count">{deactivatedStaff.length}</span>
              )}
            </button>
          )}
        </div>
      </div>

      {isSuperAdmin && showCreateModal && createPortal(
        <div className="st-modal-overlay" onClick={() => !isCreating && setShowCreateModal(false)}>
          <section
            className="st-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="st-create-modal-title"
          >
            <div className="st-modal-header">
              <div className="st-modal-heading">
                <span className="st-modal-icon" aria-hidden="true"><Users size={18} /></span>
                <div>
                  <h3 id="st-create-modal-title">Create staff account</h3>
                  <p>Add a new account and choose its access role.</p>
                </div>
              </div>
              <button
                type="button"
                className="st-modal-close"
                aria-label="Close"
                disabled={isCreating}
                onClick={() => setShowCreateModal(false)}
              >
                <X size={17} />
              </button>
            </div>
            <form className="st-create-account-form" onSubmit={createAccount}>
              <div className="st-create-account-fields">
                <label>
                  Name
                  <input name="name" type="text" autoComplete="name" maxLength="255" required />
                </label>
                <label>
                  Email
                  <input name="email" type="email" autoComplete="email" maxLength="255" required />
                </label>
                <label>
                  Temporary password
                  <input name="password" type="password" autoComplete="new-password" minLength="8" required />
                </label>
                <label>
                  Confirm password
                  <input name="password_confirmation" type="password" autoComplete="new-password" minLength="8" required />
                </label>
                <label>
                  Role
                  <select name="role" defaultValue="staff">
                    <option value="staff">Staff</option>
                    <option value="admin">Admin</option>
                    <option value="super_admin">Super Admin</option>
                  </select>
                </label>
              </div>
              {createError && <p className="st-create-account-error" role="alert">{createError}</p>}
              <div className="st-modal-actions">
                <button
                  type="button"
                  className="st-modal-cancel"
                  disabled={isCreating}
                  onClick={() => setShowCreateModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="st-create-account-button" disabled={isCreating}>
                  {isCreating ? 'Creating…' : 'Create account'}
                </button>
              </div>
            </form>
          </section>
        </div>,
        document.body
      )}

      {/* ===== STAFF TABLE ===== */}
      <div
        key={showDeactivated ? 'deactivated-accounts' : 'active-accounts'}
        className="st-table-card st-accounts-view"
      >
        {showDeactivated && (
          <div className="st-table-heading">
            <div>
              <h3>Deactivated Accounts</h3>
              <p>These accounts cannot sign in until they are activated again.</p>
            </div>
          </div>
        )}
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
              {loading ? (
                <tr>
                  <td colSpan={isSuperAdmin ? 6 : 5} className="st-empty">Loading staff…</td>
                </tr>
              ) : filtered.map((s) => {
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
                        {showDeactivated ? 'Deactivated' : s.status}
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

              {filtered.length === 0 && !loading && (
                <tr>
                  <td colSpan={isSuperAdmin ? 6 : 5} className="st-empty">
                    {visibleAccounts.length === 0
                      ? (showDeactivated ? 'No deactivated accounts.' : 'No active staff accounts.')
                      : `No staff match “${query}”.`}
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

          {menuRow.status === 'Active' ? (
            menuRow.role === 'Super Admin' && activeSuperAdmins <= 1 ? (
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
                Deactivate account
              </button>
            )
          ) : (
            <>
              <button
                type="button"
                className="st-menu-item"
                role="menuitem"
                onClick={() => openAccountDialog('reactivate', menuRow)}
              >
                <Power size={14} />
                Reactivate Account
              </button>
              <button
                type="button"
                className="st-menu-item st-menu-item-danger"
                role="menuitem"
                onClick={() => openAccountDialog('delete-initial', menuRow)}
              >
                <Trash2 size={14} />
                Permanently Delete
              </button>
            </>
          )}
        </div>,
        document.body
      )}

      {accountDialog && createPortal(
        <div
          className="st-modal-overlay st-account-confirm-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !isAccountActionLoading) {
              closeAccountDialog();
            }
          }}
        >
          <section
            className={`st-modal st-account-confirm ${
              accountDialog.step === 'delete-final' ? 'st-account-confirm-final' : ''
            }`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="st-account-confirm-title"
          >
            <header className="st-modal-header">
              <div>
                <p className="st-modal-eyebrow">
                  {accountDialog.step === 'reactivate' ? 'Reactivate account' : 'Permanent deletion'}
                </p>
                <h2 id="st-account-confirm-title">
                  {accountDialog.step === 'reactivate'
                    ? 'Reactivate Account?'
                    : accountDialog.step === 'delete-initial'
                      ? 'Delete Account Permanently?'
                      : 'Final Confirmation'}
                </h2>
              </div>
              <button
                type="button"
                className="st-modal-close"
                aria-label="Close confirmation"
                onClick={closeAccountDialog}
                disabled={isAccountActionLoading}
              >
                <X size={18} />
              </button>
            </header>
            <div className="st-account-confirm-body">
              <p className={accountDialog.step === 'delete-final' ? 'st-delete-warning' : ''}>
                {accountDialog.step === 'reactivate'
                  ? `Are you sure you want to reactivate ${accountDialog.account.name}'s account?`
                  : accountDialog.step === 'delete-initial'
                    ? `Are you sure you want to permanently delete ${accountDialog.account.name}'s account? This action cannot be undone.`
                    : 'You are about to permanently delete this account and its associated account access. This action cannot be undone.'}
              </p>
              <div className="st-account-confirm-identity">
                <span>{accountDialog.account.name}</span>
                <span>{accountDialog.account.email}</span>
              </div>

              {accountDialog.step === 'delete-final' && (
                <label className="st-delete-confirm-label">
                  Type <strong>DELETE</strong> to confirm
                  <input
                    autoComplete="off"
                    autoFocus
                    value={deleteConfirmation}
                    onChange={(event) => setDeleteConfirmation(event.target.value)}
                    aria-label="Type DELETE to confirm permanent deletion"
                  />
                </label>
              )}

              {accountActionError && (
                <div className="st-create-account-error" role="alert">
                  {accountActionError}
                </div>
              )}
            </div>
            <footer className="st-account-confirm-actions">
              <button
                type="button"
                className="st-confirm-cancel"
                onClick={closeAccountDialog}
                disabled={isAccountActionLoading}
              >
                Cancel
              </button>
              {accountDialog.step === 'reactivate' ? (
                <button
                  type="button"
                  className="st-confirm-primary"
                  onClick={confirmReactivate}
                  disabled={isAccountActionLoading}
                >
                  {isAccountActionLoading ? 'Reactivating…' : 'Reactivate'}
                </button>
              ) : accountDialog.step === 'delete-initial' ? (
                <button
                  type="button"
                  className="st-confirm-danger"
                  onClick={() => {
                    setAccountActionError('');
                    setDeleteConfirmation('');
                    setAccountDialog((current) => ({ ...current, step: 'delete-final' }));
                  }}
                >
                  Continue
                </button>
              ) : (
                <button
                  type="button"
                  className="st-confirm-danger"
                  onClick={confirmPermanentDelete}
                  disabled={isAccountActionLoading || deleteConfirmation !== 'DELETE'}
                >
                  {isAccountActionLoading ? 'Deleting…' : 'Permanently Delete Account'}
                </button>
              )}
            </footer>
          </section>
        </div>,
        document.body
      )}
    </div>
  );
}

export default Staffs;
