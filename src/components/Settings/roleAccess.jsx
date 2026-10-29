import React, { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, KeyRound, RotateCcw } from 'lucide-react';
import apiFetch from '../../apiFetch';

/* ===== ROLE ACCESS (Super Admin only) =====
   Tick what Admin and Staff may use. The list of features comes from the
   server (RoleAccessService), and the server checks the same boxes on every
   action, so this screen is the single place to change access.
   - A smaller feature only works when its page box is also ticked.
   - The Super Admin can always use everything.
   - Staffs, Safety Stock Policy, the system logo and this screen stay
     Super Admin only and are not listed. */
const ROLES = [
  { key: 'admin', label: 'Admin' },
  { key: 'staff', label: 'Staff' },
];

export default function RoleAccess() {
  const [open, setOpen] = useState(false);
  const [catalog, setCatalog] = useState([]);
  const [saved, setSaved] = useState(null);       // what the server has
  const [draft, setDraft] = useState(null);       // what is ticked on screen
  const [defaults, setDefaults] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    let active = true;
    fetch('/api/role-access', { headers: { Accept: 'application/json' }, cache: 'no-store' })
      .then((response) => {
        if (!response.ok) throw new Error(`Could not load Role Access (${response.status}).`);
        return response.json();
      })
      .then((body) => {
        if (!active) return;
        setCatalog(Array.isArray(body.catalog) ? body.catalog : []);
        setSaved(body.matrix || null);
        setDraft(body.matrix || null);
        setDefaults(body.defaults || null);
      })
      .catch((error) => { if (active) setLoadError(error.message || 'Could not load Role Access.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const groups = useMemo(() => {
    const byGroup = new Map();
    catalog.forEach((item) => {
      if (!byGroup.has(item.group)) byGroup.set(item.group, []);
      byGroup.get(item.group).push(item);
    });
    return [...byGroup.entries()];
  }, [catalog]);

  const parentOf = useMemo(() => Object.fromEntries(catalog.map((item) => [item.key, item.parent])), [catalog]);

  /* Ticked AND every parent ticked — what the role can really use. */
  const isEffective = (role, key) => {
    let current = key;
    const seen = new Set();
    while (current && !seen.has(current)) {
      seen.add(current);
      if (!draft?.[role]?.[current]) return false;
      current = parentOf[current];
    }
    return true;
  };

  const parentOnForAnyRole = (key) => {
    const parent = parentOf[key];
    if (!parent) return true;
    return ROLES.some((role) => isEffective(role.key, parent));
  };

  const changeCount = useMemo(() => {
    if (!saved || !draft) return 0;
    let count = 0;
    ROLES.forEach(({ key: role }) => {
      Object.keys(draft[role] || {}).forEach((feature) => {
        if (draft[role][feature] !== saved[role]?.[feature]) count += 1;
      });
    });
    return count;
  }, [saved, draft]);
  const dirty = changeCount > 0;

  const toggle = (role, key) => {
    setJustSaved(false);
    setSaveError('');
    setDraft((current) => ({
      ...current,
      [role]: { ...current[role], [key]: !current[role][key] },
    }));
  };

  const resetToDefaults = () => {
    if (!defaults) return;
    setJustSaved(false);
    setSaveError('');
    setDraft(defaults);
  };

  const discard = () => {
    setSaveError('');
    setDraft(saved);
  };

  const save = async () => {
    setSaving(true);
    setSaveError('');
    try {
      const response = await apiFetch('/api/role-access', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(Object.values(body?.errors || {}).flat()[0] || body?.message || `Save failed (${response.status}).`);
      }
      setSaved(body.matrix);
      setDraft(body.matrix);
      setJustSaved(true);
    } catch (error) {
      setSaveError(error.message || 'Role Access could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className={`s-card s-roles${open ? ' is-open' : ''}`} aria-labelledby="s-roles-title">
      <header className="s-card-head">
        <div className="s-card-head-main">
          <span className="s-pref-icon is-accent" aria-hidden="true"><KeyRound size={15} /></span>
          <div className="s-card-titles">
            <h2 className="s-card-title" id="s-roles-title">Role Access</h2>
            <span className="s-card-sub">Choose what Admin and Staff can use. The Super Admin can always use everything.</span>
          </div>
        </div>
        <button
          type="button"
          className="s-ghost-btn s-roles-toggle"
          aria-expanded={open}
          aria-controls="s-roles-body"
          onClick={() => setOpen((value) => !value)}
        >
          {open ? 'Hide' : 'Manage'} <ChevronDown size={13} className={open ? 's-roles-chevron is-open' : 's-roles-chevron'} />
        </button>
      </header>

      {open && (
        <div className="s-roles-body" id="s-roles-body">
          {loading && <p className="s-roles-note" role="status">Loading Role Access…</p>}
          {loadError && <p className="s-policy-error" role="alert">{loadError}</p>}

          {!loading && !loadError && draft && (
            <>
              <p className="s-roles-note hint-text">
                Smaller features only work when their page is ticked too, and they appear once the page is on for Admin or Staff.
                Changes reach other accounts within a minute.
              </p>

              <div className="s-roles-scroll" role="table" aria-label="Role Access by feature">
                <div className="s-roles-row s-roles-head" role="row">
                  <span role="columnheader">Feature</span>
                  {ROLES.map((role) => <span key={role.key} role="columnheader" className="s-roles-col">{role.label}</span>)}
                </div>

                {groups.map(([group, items]) => (
                  <div className="s-roles-group" role="rowgroup" key={group}>
                    <div className="s-roles-group-title" role="row"><span role="cell">{group}</span></div>
                    {items.filter((item) => parentOnForAnyRole(item.key)).map((item) => (
                      <div className={`s-roles-row${item.parent ? ' is-child' : ''}`} role="row" key={item.key}>
                        <span role="cell" className="s-roles-label">{item.label}</span>
                        {ROLES.map((role) => {
                          const ticked = Boolean(draft[role.key]?.[item.key]);
                          const blockedByParent = ticked && !isEffective(role.key, item.key);
                          return (
                            <span role="cell" className="s-roles-col" key={role.key}>
                              <input
                                type="checkbox"
                                className="s-roles-check"
                                checked={ticked}
                                onChange={() => toggle(role.key, item.key)}
                                aria-label={`${role.label}: ${item.label}`}
                                title={blockedByParent ? 'Ticked, but its page is off for this role, so it has no effect yet' : undefined}
                              />
                              {blockedByParent && <small className="s-roles-blocked">page off</small>}
                            </span>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                ))}
              </div>

              <footer className="s-policy-footer">
                <span className="s-policy-footer-status">
                  {saveError && <span className="s-policy-error" role="alert">{saveError}</span>}
                  {!saveError && dirty && <span className="s-unsaved"><i aria-hidden="true" /> {changeCount} unsaved {changeCount === 1 ? 'change' : 'changes'}</span>}
                  {!saveError && justSaved && !dirty && <span className="s-saved-flag"><Check size={12} /> Role Access saved</span>}
                </span>
                <button type="button" className="s-ghost-btn" onClick={resetToDefaults} disabled={saving || !defaults} title="Tick the boxes the way the system started (not saved until you press Save)">
                  Defaults
                </button>
                <button type="button" className="s-ghost-btn" onClick={discard} disabled={!dirty || saving}>
                  <RotateCcw size={13} /> Discard
                </button>
                <button type="button" className="s-primary-btn" onClick={save} disabled={!dirty || saving}>
                  {saving ? 'Saving…' : 'Save Role Access'}
                </button>
              </footer>
            </>
          )}
        </div>
      )}
    </section>
  );
}
