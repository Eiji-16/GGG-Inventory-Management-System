import React, { useEffect, useMemo, useRef, useState } from 'react';
import MarqueeText from '../../utils/marqueeText';
import { PageToast } from '../../utils/toast';
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
  KeyRound,
  UserPlus,
  RotateCcw,
} from 'lucide-react';
import './staff.css';
import AccountRequests from './AccountRequests';
import { uiZoom } from '../../fontSize';

const ALL_ROLES = ['Staff', 'Admin', 'Super Admin'];

/* Map the display role label the UI uses to the backend role value. */
const ROLE_TO_API = { 'Super Admin': 'super_admin', Admin: 'admin', Staff: 'staff' };

const csrf = () => document.querySelector('meta[name="csrf-token"]')?.content || '';

/* Default profile picture: the person's initials (same as Profile and the sidebar). */
const initialsOf = (name) => String(name || '?').trim().split(/\s+/).filter(Boolean)
  .slice(0, 2).map((part) => part[0]).join('').toUpperCase() || '?';

/* ===== ROLE VISUALS ===== */
const ROLE_META = {
  'Super Admin': { Icon: ShieldCheck, cls: 'st-role-super' },
  Admin:         { Icon: UserCog,     cls: 'st-role-admin' },
  Staff:         { Icon: Shield,      cls: 'st-role-staff' },
};

/* isSuperAdmin = everything. canManageStaff = an Admin with Role Access
   "Manage Staff": Staff accounts only, no role changes (the server checks
   the same rules). */
function Staffs({ isSuperAdmin = false, canManageStaff = false, onSessionRevoked }) {
  const canManage = isSuperAdmin || canManageStaff;
  // An Admin can act only on Staff rows.
  const canActOn = (account) => isSuperAdmin || (canManageStaff && account?.role === 'Staff');
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
  // 2026-11-12: tick several deactivated accounts, then Reactivate or Move to Trash Bin at once.
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  // Tabs (Super Admin, 2026-11-06): 'accounts' | 'requests' — same style as Stock | History.
  const [staffView, setStaffView] = useState('accounts');
  const [requestCount, setRequestCount] = useState(0);
  const showRequests = isSuperAdmin && staffView === 'requests';
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

  /* 2026-11-12: the list updates by itself when something changes (a new
     account finished its setup, someone approved, deactivated…): the main
     page checks every 5 seconds and sends this event. */
  useEffect(() => {
    const onChanged = () => { refreshStaff().catch(() => { /* keep the list shown; next change tries again */ }); };
    window.addEventListener('ggg-account-requests-changed', onChanged);
    return () => window.removeEventListener('ggg-account-requests-changed', onChanged);
  }, []);

  useEffect(() => {
    if (!actionMessage) return undefined;
    const timeout = window.setTimeout(() => setActionMessage(''), 5000);
    return () => window.clearTimeout(timeout);
  }, [actionMessage]);

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

  /* ===== MULTI-SELECT (Deactivated Accounts, 2026-11-12) ===== */
  const canSelect = canManage && showDeactivated;
  const selectableRows = canSelect ? filtered.filter((account) => canActOn(account)) : [];
  const selectedAccounts = deactivatedStaff.filter((account) => selectedIds.has(account.id) && canActOn(account));
  const allSelected = selectableRows.length > 0 && selectableRows.every((account) => selectedIds.has(account.id));
  const toggleSelected = (id) => setSelectedIds((previous) => {
    const next = new Set(previous);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleAllSelected = () => setSelectedIds((previous) => {
    const next = new Set(previous);
    if (allSelected) selectableRows.forEach((account) => next.delete(account.id));
    else selectableRows.forEach((account) => next.add(account.id));
    return next;
  });
  // Leaving the Deactivated view clears the ticks.
  useEffect(() => { if (!showDeactivated) setSelectedIds(new Set()); }, [showDeactivated]);
  const tableColumns = (canManage ? 6 : 5) + (canSelect ? 1 : 0);
  const bulkCount = accountDialog?.accounts ? accountDialog.accounts.length : 0;
  const isReactivateStep = accountDialog?.step === 'reactivate' || accountDialog?.step === 'bulk-reactivate';

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

  /* ===== PROFILE PHOTO (Super Admin) =====
     Same photo as the person's own Profile; no photo = initials. */
  const photoInput = useRef(null);
  const [photoTarget, setPhotoTarget] = useState(null);
  const [photoBusyId, setPhotoBusyId] = useState(null);

  const replaceAccount = (updated) => {
    const swap = (list) => list.map((item) => (item.id === updated.id ? { ...item, ...updated } : item));
    setStaff(swap);
    setDeactivatedStaff(swap);
  };

  const choosePhoto = (account) => {
    setMenu(null);
    setPhotoTarget(account);
    if (photoInput.current) {
      photoInput.current.value = '';
      photoInput.current.click();
    }
  };

  const uploadPhoto = async (event) => {
    const file = event.target.files?.[0];
    const account = photoTarget;
    if (!file || !account) return;
    if (file.size > 2 * 1024 * 1024) {
      setActionMessage('');
      setActionError('The picture must be 2 MB or smaller.');
      return;
    }
    setPhotoBusyId(account.id);
    try {
      const form = new FormData();
      form.append('avatar', file);
      const response = await fetch(`/staff/${account.id}/avatar`, {
        method: 'POST',
        headers: { Accept: 'application/json', 'X-CSRF-TOKEN': csrf() },
        body: form,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = data.errors ? Object.values(data.errors).flat()[0] : data.message;
        throw new Error(message || `Could not save the photo (${response.status}).`);
      }
      replaceAccount(data);
      setActionError('');
      setActionMessage(`${account.name}'s profile photo was updated.`);
    } catch (error) {
      setActionMessage('');
      setActionError(error.message || 'Could not save the photo.');
    } finally {
      setPhotoBusyId(null);
      setPhotoTarget(null);
    }
  };

  const removePhoto = async (account) => {
    setMenu(null);
    setPhotoBusyId(account.id);
    try {
      const response = await fetch(`/staff/${account.id}/avatar`, {
        method: 'DELETE',
        headers: { Accept: 'application/json', 'X-CSRF-TOKEN': csrf() },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || `Could not remove the photo (${response.status}).`);
      replaceAccount(data);
      setActionError('');
      setActionMessage(`${account.name}'s profile photo was removed.`);
    } catch (error) {
      setActionMessage('');
      setActionError(error.message || 'Could not remove the photo.');
    } finally {
      setPhotoBusyId(null);
    }
  };

  /* Super Admin: turn off the authenticator app (2FA) for someone who lost
     their phone. They then sign in with the password only. */
  const resetTwoFactor = async (account) => {
    setMenu(null);
    const what = account.twoFactor ? 'the authenticator app' : 'email codes';
    if (!window.confirm(`Turn off ${what} for ${account.name}? They will sign in with their password only.`)) return;
    try {
      const response = await fetch(`/staff/${account.id}/two-factor`, {
        method: 'DELETE',
        headers: { Accept: 'application/json', 'X-CSRF-TOKEN': csrf() },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || `Could not turn off the authenticator (${response.status}).`);
      replaceAccount(data);
      setActionError('');
      setActionMessage(`Two-step sign-in is off for ${account.name}.`);
    } catch (error) {
      setActionMessage('');
      setActionError(error.message || 'Could not turn off the authenticator.');
    }
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
    // First placed under the button; the effect below measures the real
    // menu height and opens it upward only when it would not fit below.
    setMenu({ id: s.id, top: rect.bottom + 6, left: Math.max(12, left), anchorTop: box.top / zoom, anchorBottom: rect.bottom });
  };

  // Keep the row menu fully on screen, using its real (measured) height.
  React.useLayoutEffect(() => {
    if (!menu || menu.measured) return;
    const element = document.querySelector('.st-action-menu');
    if (!element) return;
    const height = element.offsetHeight;
    const viewport = window.innerHeight / uiZoom();
    let top = menu.anchorBottom + 6;
    if (top + height > viewport - 12) top = Math.max(12, menu.anchorTop - height - 6);
    setMenu((current) => (current && current.id === menu.id ? { ...current, top, measured: true } : current));
  }, [menu]);

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
      if (data.sessionRevoked) {
        onSessionRevoked?.();
        return;
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
      if (body.status === 'inactive') {
        setActionMessage(`${data.name}'s account has been deactivated.`);
      }
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

  const confirmMoveToTrash = async () => {
    if (
      !accountDialog ||
      accountDialog.step !== 'delete-initial' ||
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
        // 2026-11-11: one confirmation is enough (the account only goes to the
        // Trash Bin and can be restored), so the word is sent for the person.
        body: JSON.stringify({ confirmation: 'DELETE' }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = data.errors ? Object.values(data.errors).flat()[0] : data.message;
        throw new Error(message || `Could not move account to Trash Bin (${response.status}).`);
      }

      setDeactivatedStaff((previous) => previous.filter((item) => item.id !== account.id));
      setActionError('');
      setActionMessage(`${account.name}'s account was moved to the Trash Bin.`);
      closeAccountDialog();
    } catch (error) {
      setAccountActionError(error.message || 'Could not move the account to the Trash Bin.');
    } finally {
      setIsAccountActionLoading(false);
    }
  };

  /* Reactivate / Move to Trash Bin for every ticked account (one by one,
     the same requests as the row menu, so the server checks each one). */
  const confirmBulk = async () => {
    if (!accountDialog?.accounts || isAccountActionLoading) return;
    const reactivating = accountDialog.step === 'bulk-reactivate';
    setIsAccountActionLoading(true);
    setAccountActionError('');
    const done = [];
    const failed = [];
    for (const account of accountDialog.accounts) {
      try {
        const response = await fetch(`/staff/${account.id}`, {
          method: reactivating ? 'PATCH' : 'DELETE',
          headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-CSRF-TOKEN': csrf() },
          body: JSON.stringify(reactivating ? { status: 'active' } : { confirmation: 'DELETE' }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          const message = data.errors ? Object.values(data.errors).flat()[0] : data.message;
          throw new Error(message || `Error ${response.status}`);
        }
        done.push(reactivating ? data : account);
      } catch (error) {
        failed.push(`${account.name}: ${error.message}`);
      }
    }

    const doneIds = new Set(done.map((account) => account.id));
    setDeactivatedStaff((previous) => previous.filter((item) => !doneIds.has(item.id)));
    if (reactivating && done.length) {
      setStaff((previous) => (
        [...previous.filter((item) => !doneIds.has(item.id)), ...done]
          .sort((a, b) => a.name.localeCompare(b.name))
      ));
    }
    setSelectedIds((previous) => new Set([...previous].filter((id) => !doneIds.has(id))));
    setIsAccountActionLoading(false);

    if (failed.length) {
      setAccountActionError(`${done.length ? `${done.length} done. ` : ''}Not changed: ${failed.join(' · ')}`);
      setAccountDialog((previous) => previous && ({ ...previous, accounts: previous.accounts.filter((account) => !doneIds.has(account.id)) }));
      return;
    }
    const count = `${done.length} account${done.length === 1 ? '' : 's'}`;
    setActionError('');
    setActionMessage(reactivating ? `${count} reactivated.` : `${count} moved to the Trash Bin.`);
    closeAccountDialog();
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
      {loadError && (
        <div className="st-create-account-error" role="alert" style={{ marginBottom: 12 }}>
          {loadError}
        </div>
      )}
      <PageToast message={actionError} type="error" onShown={() => setActionError('')} />
      {/* Page messages show as a bottom-right pop-up (2026-11-06). */}
      <PageToast message={actionMessage} type="success" onShown={() => setActionMessage('')} />

      {/* ===== KPI CARDS ===== */}
      <div className="st-kpi-row">
        <div className="st-kpi-card st-kpi-feature">
          <div className="st-kpi-icon"><Users size={18} /></div>
          <div>
            <p className="st-kpi-value"><MarqueeText>{Number(total).toLocaleString()}</MarqueeText></p>
            <p className="st-kpi-label">Total staff</p>
          </div>
        </div>
        <div className="st-kpi-card">
          <div className="st-kpi-icon st-kpi-icon-green"><CircleDot size={18} /></div>
          <div>
            <p className="st-kpi-value"><MarqueeText>{Number(active).toLocaleString()}</MarqueeText></p>
            <p className="st-kpi-label">Active</p>
          </div>
        </div>
        <div className="st-kpi-card">
          <div className="st-kpi-icon st-kpi-icon-gold"><ShieldCheck size={18} /></div>
          <div>
            <p className="st-kpi-value"><MarqueeText>{Number(admins).toLocaleString()}</MarqueeText></p>
            <p className="st-kpi-label">Admins &amp; up</p>
          </div>
        </div>
      </div>

      {/* ===== TABS + SEARCH ===== */}
      <div className="st-controls-bar">
        {isSuperAdmin && (
          <div className="st-view-tabs" role="tablist" aria-label="Staffs view">
            <button type="button" role="tab" aria-selected={!showRequests} className={!showRequests ? 'is-active' : ''} onClick={() => setStaffView('accounts')}>
              <Users size={13} aria-hidden="true" /> Accounts
            </button>
            <button type="button" role="tab" aria-selected={showRequests} className={showRequests ? 'is-active' : ''} onClick={() => { setMenu(null); setStaffView('requests'); }}>
              <UserPlus size={13} aria-hidden="true" /> Account requests
              {requestCount > 0 && <span className="st-view-tab-count">{requestCount}</span>}
            </button>
          </div>
        )}
        {!showRequests && (<>
        <div className="st-search-box xs-search">
          <Search size={16} className="st-search-icon" />
          <input
            autoComplete="off"
            type="text"
            className="st-search-input"
            placeholder={`Search ${showDeactivated ? 'deactivated ' : ''}staff by name, email or role…`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="st-controls-actions">
          {canManage && !showDeactivated && (
            <button
              type="button"
              className="st-create-account-button"
              onClick={() => {
                setCreateError('');
                setShowCreateModal(true);
              }}
            >
              <UserRoundPlus size={15} />
              <span className="st-label-long">Create Staff Account</span>
              <span className="st-label-short">New</span>
            </button>
          )}
          {canManage && (
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
              <span className="st-label-long">{showDeactivated ? 'Active Accounts' : 'Deactivated Accounts'}</span>
              <span className="st-label-short">{showDeactivated ? 'Active' : 'Deactivated'}</span>
              {!showDeactivated && deactivatedStaff.length > 0 && (
                <span className="st-deactivated-count">{deactivatedStaff.length}</span>
              )}
            </button>
          )}
        </div>
        </>)}
      </div>

      {canManage && showCreateModal && createPortal(
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
                  <input name="password" type="password" autoComplete="new-password" minLength="8" required onInput={(event) => { event.currentTarget.value = event.currentTarget.value.replace(/\s/g, ''); }} />
                </label>
                <label>
                  Confirm password
                  <input name="password_confirmation" type="password" autoComplete="new-password" minLength="8" required onInput={(event) => { event.currentTarget.value = event.currentTarget.value.replace(/\s/g, ''); }} />
                </label>
                <label>
                  Role
                  <select name="role" defaultValue="staff">
                    <option value="staff">Staff</option>
                    {isSuperAdmin && <option value="admin">Admin</option>}
                    {isSuperAdmin && <option value="super_admin">Super Admin</option>}
                  </select>
                </label>
              </div>
              <PageToast message={createError} type="error" onShown={() => setCreateError('')} />
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

      {/* ===== ACCOUNT REQUESTS TAB (Super Admin) =====
          Stays mounted while the Accounts tab is open so the tab badge keeps
          counting new requests; it only draws its table on its own tab. */}
      {isSuperAdmin && (
        <AccountRequests
          hidden={!showRequests}
          onCount={setRequestCount}
          onChanged={() => window.dispatchEvent(new Event('ggg-account-requests-changed'))}
        />
      )}

      {/* ===== STAFF TABLE ===== */}
      {!showRequests && (
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
            {canSelect && selectedAccounts.length > 0 && (
              <div className="st-bulk-bar" role="toolbar" aria-label="Selected accounts">
                <span className="st-bulk-count">{selectedAccounts.length} selected</span>
                <button
                  type="button"
                  className="st-bulk-button"
                  onClick={() => { setMenu(null); setAccountActionError(''); setAccountDialog({ step: 'bulk-reactivate', accounts: selectedAccounts }); }}
                >
                  <RotateCcw size={14} aria-hidden="true" /> Reactivate
                </button>
                <button
                  type="button"
                  className="st-bulk-button is-danger"
                  onClick={() => { setMenu(null); setAccountActionError(''); setAccountDialog({ step: 'bulk-delete', accounts: selectedAccounts }); }}
                >
                  <Trash2 size={14} aria-hidden="true" /> Move to Trash Bin
                </button>
                <button type="button" className="st-bulk-clear" onClick={() => setSelectedIds(new Set())} aria-label="Clear selection" title="Clear selection">
                  <X size={14} />
                </button>
              </div>
            )}
          </div>
        )}
        <div className="st-table-scroll">
          <table className="st-table">
            <thead>
              <tr>
                {canSelect && (
                  <th className="st-th-select">
                    <input
                      type="checkbox"
                      className="st-select-box"
                      checked={allSelected}
                      onChange={toggleAllSelected}
                      disabled={selectableRows.length === 0}
                      aria-label="Select all deactivated accounts"
                    />
                  </th>
                )}
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Last active</th>
                {canManage && <th className="st-th-actions">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={tableColumns} className="st-empty ui-loading">Loading staff…</td>
                </tr>
              ) : filtered.map((s) => {
                const role = ROLE_META[s.role] || ROLE_META.Staff;
                const RoleIcon = role.Icon;
                return (
                  <tr key={s.id} className={canSelect && selectedIds.has(s.id) ? 'is-selected' : undefined}>
                    {canSelect && (
                      <td className="st-cell-select">
                        {canActOn(s) && (
                          <input
                            type="checkbox"
                            className="st-select-box"
                            checked={selectedIds.has(s.id)}
                            onChange={() => toggleSelected(s.id)}
                            aria-label={`Select ${s.name}`}
                          />
                        )}
                      </td>
                    )}
                    <td className="st-cell-name" data-label="Name">
                      <span className="st-name-wrap">
                        <span className={`st-avatar${photoBusyId === s.id ? ' is-busy' : ''}`} aria-hidden="true">
                          {s.avatarUrl ? <img src={s.avatarUrl} alt="" /> : initialsOf(s.name)}
                        </span>
                        <span className="st-name-text">{s.name}</span>
                      </span>
                    </td>
                    <td className="st-cell-muted st-cell-email" data-label="Email">{s.email}</td>
                    <td className="st-cell-role" data-label="Role">
                      <span className={`st-role-badge ${role.cls}`}>
                        <RoleIcon size={12} />
                        {s.role}
                      </span>
                    </td>
                    <td className="st-cell-status" data-label="Status">
                      <span
                        className={`st-status ${
                          s.status === 'Active' ? 'st-status-on' : 'st-status-off'
                        }`}
                      >
                        {showDeactivated ? 'Deactivated' : s.status}
                      </span>
                      {s.waitingVerification && !showDeactivated && (
                        <span className="st-status st-status-unverified" title="Created by Approve & Invite. Can sign in after clicking the email link.">
                          Not verified
                        </span>
                      )}
                    </td>
                    <td className="st-cell-muted st-cell-last" data-label="Last active">{s.lastActive}</td>
                    {canManage && (
                      <td className="st-cell-actions">
                        {canActOn(s) ? (
                        <button
                          type="button"
                          className="st-kebab"
                          aria-label={`Manage ${s.name}`}
                          onClick={(e) => openMenu(e, s)}
                        >
                          <MoreVertical size={16} />
                        </button>
                        ) : (
                          <span className="st-cell-muted" title="Only the Super Admin can manage Admin and Super Admin accounts">—</span>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}

              {filtered.length === 0 && !loading && (
                <tr>
                  <td colSpan={tableColumns} className="st-empty">
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
      )}

      {/* Hidden picker for "Add / Change photo" in the row menu. */}
      {canManage && (
        <input
          ref={photoInput}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          onChange={uploadPhoto}
          hidden
        />
      )}

      {/* ===== ROW ACTION MENU (Super Admin only, fixed-position) ===== */}
      {menu && menuRow && createPortal(
        <div
          className="st-action-menu"
          style={{ top: menu.top, left: Math.max(12, menu.left) }}
          role="menu"
        >
          {isSuperAdmin && (menuRow.twoFactor || menuRow.twoFactorEmail) && (<>
            <p className="st-menu-head">Sign-in security</p>
            <button
              type="button"
              className="st-menu-item"
              role="menuitem"
              onClick={() => resetTwoFactor(menuRow)}
            >
              <KeyRound size={14} />
              {menuRow.twoFactor ? 'Turn off authenticator (lost phone)' : 'Turn off email codes'}
            </button>
            <div className="st-menu-divider" />
          </>)}

          {isSuperAdmin && (<>
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
          </>)}

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
                Move to Trash Bin
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
            className="st-modal st-account-confirm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="st-account-confirm-title"
          >
            <header className="st-modal-header">
              <div>
                <p className="st-modal-eyebrow">
                  {isReactivateStep ? (bulkCount ? 'Reactivate accounts' : 'Reactivate account') : 'Move to Trash Bin'}
                </p>
                <h2 id="st-account-confirm-title">
                  {bulkCount
                    ? (isReactivateStep ? `Reactivate ${bulkCount} Account${bulkCount === 1 ? '' : 's'}?` : `Move ${bulkCount} Account${bulkCount === 1 ? '' : 's'} to Trash Bin?`)
                    : (isReactivateStep ? 'Reactivate Account?' : 'Move Account to Trash Bin?')}
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
              {bulkCount ? (<>
                <p>
                  {isReactivateStep
                    ? 'These accounts can sign in again right away.'
                    : 'These deactivated accounts move to the Trash Bin. A Super Admin can restore them from the Trash Bin.'}
                </p>
                <ul className="st-bulk-list">
                  {accountDialog.accounts.map((account) => (
                    <li key={account.id} className="st-account-confirm-identity">
                      <span>{account.name}</span>
                      <span>{account.email}</span>
                    </li>
                  ))}
                </ul>
              </>) : (<>
              <p>
                {accountDialog.step === 'reactivate'
                  ? `Are you sure you want to reactivate ${accountDialog.account.name}'s account?`
                  : `Move ${accountDialog.account.name}'s deactivated account to the Trash Bin? They are signed out, and a Super Admin can restore the account from the Trash Bin.`}
              </p>
              <div className="st-account-confirm-identity">
                <span>{accountDialog.account.name}</span>
                <span>{accountDialog.account.email}</span>
              </div>
              </>)}

              <PageToast message={accountActionError} type="error" onShown={() => setAccountActionError('')} />
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
              {isReactivateStep ? (
                <button
                  type="button"
                  className="st-confirm-primary"
                  onClick={bulkCount ? confirmBulk : confirmReactivate}
                  disabled={isAccountActionLoading}
                >
                  {isAccountActionLoading ? 'Reactivating…' : 'Reactivate'}
                </button>
              ) : (
                <button
                  type="button"
                  className="st-confirm-danger"
                  onClick={bulkCount ? confirmBulk : confirmMoveToTrash}
                  disabled={isAccountActionLoading}
                >
                  {isAccountActionLoading ? 'Moving…' : 'Move to Trash Bin'}
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
