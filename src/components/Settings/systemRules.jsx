import React, { useEffect, useState } from 'react';
import { Check, ChevronDown, Clock, Lock, ShieldCheck } from 'lucide-react';
import { PageToast } from '../../utils/toast';
import { limitDigits } from '../../utils/numberLimit';
import apiFetch from '../../apiFetch';

/* ===== SECURITY AND DEFAULTS (2026-11-11, Super Admin) =====
   1. Require the authenticator app for every account: accounts without it
      must set it up (QR code + 6-digit code) at their next sign-in.
   2. Default lead time: days used when neither the product's policy nor
      its supplier has a lead time, so the reorder point is not just the
      safety stock.
   GET / PUT /api/settings/system (saved in app_settings, no migration). */
export default function SystemRules() {
  const [settings, setSettings] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [leadDraft, setLeadDraft] = useState('');
  const [saving, setSaving] = useState('');
  const [saved, setSaved] = useState('');
  const [error, setError] = useState('');
  // 2026-11-11: folded by default; "Manage" opens it (same as Data & System).
  const [open, setOpen] = useState(false);

  const apply = (data) => {
    setSettings(data);
    setLeadDraft(data.defaultLeadTimeDays == null ? '' : String(data.defaultLeadTimeDays));
  };

  useEffect(() => {
    let active = true;
    apiFetch('/api/settings/system', { headers: { Accept: 'application/json' }, cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || `Could not load the settings (${response.status}).`);
        if (active) apply(data);
      })
      .catch((loadFailure) => { if (active) setLoadError(loadFailure.message || 'Could not load the settings.'); });
    return () => { active = false; };
  }, []);

  const save = async (changes, which) => {
    setSaving(which);
    setSaved('');
    setError('');
    try {
      const response = await apiFetch('/api/settings/system', {
        method: 'PUT',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(changes),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error((data.errors ? Object.values(data.errors).flat()[0] : data.message) || `Could not save (${response.status}).`);
      }
      apply(data);
      setSaved(which);
    } catch (saveError) {
      setError(saveError.message || 'Could not save.');
    } finally {
      setSaving('');
    }
  };

  const savedLead = settings?.defaultLeadTimeDays == null ? '' : String(settings.defaultLeadTimeDays);
  const leadChanged = leadDraft !== savedLead;
  const required = Boolean(settings?.requireAuthenticator);
  const missing = settings?.accountsWithoutAuthenticator ?? 0;

  return (
    <section className={`s-card s-rules${open ? ' is-open' : ''}`} aria-labelledby="s-rules-title">
      <header className="s-card-head">
        <div className="s-card-head-main">
          <span className="s-pref-icon is-accent" aria-hidden="true"><ShieldCheck size={15} /></span>
          <div className="s-card-titles">
            <h2 className="s-card-title" id="s-rules-title">
              Security and defaults
              <span className="s-restricted-badge"><Lock size={9} /> Super Admin</span>
            </h2>
            <span className="s-card-sub hint-text">Rules that apply to every account and product.</span>
          </div>
        </div>
        <button type="button" className="s-ghost-btn" aria-expanded={open} aria-controls="s-rules-body" onClick={() => setOpen((value) => !value)}>
          {open ? 'Hide' : 'Manage'} <ChevronDown size={13} className={open ? 's-roles-chevron is-open' : 's-roles-chevron'} />
        </button>
      </header>

      {open && loadError && <p className="s-policy-error" role="alert">{loadError}</p>}
      <PageToast message={error} type="error" onShown={() => setError('')} />

      {open && settings && (
        <div className="s-rules-body" id="s-rules-body">
          {/* Require the authenticator app */}
          <div className="s-pref-row">
            <span className="s-pref-icon" aria-hidden="true"><ShieldCheck size={15} /></span>
            <div className="s-pref-text">
              <span className="s-pref-title" id="s-rules-2fa-title">Require the authenticator app for every account</span>
              <span className="s-pref-desc hint-text">
                Accounts without it must scan a QR code with Google or Microsoft Authenticator at their next sign-in.
              </span>
              {missing > 0 && (
                <span className="s-pref-status s-rules-note">
                  {missing} active {missing === 1 ? 'account does' : 'accounts do'} not have the authenticator app yet.
                </span>
              )}
              {saving === '2fa' && <span className="s-pref-status" role="status">Saving…</span>}
              {saved === '2fa' && <span className="s-pref-status" role="status"><Check size={11} /> Saved</span>}
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={required}
              aria-labelledby="s-rules-2fa-title"
              className={`s-switch${required ? ' is-on' : ''}`}
              onClick={() => save({ requireAuthenticator: !required }, '2fa')}
              disabled={saving !== ''}
            >
              <span className="s-switch-knob" aria-hidden="true" />
            </button>
          </div>

          {/* Default lead time */}
          <div className="s-pref-row">
            <span className="s-pref-icon" aria-hidden="true"><Clock size={15} /></span>
            <div className="s-pref-text">
              <label className="s-pref-title" htmlFor="s-rules-lead">Default lead time</label>
              <span className="s-pref-desc hint-text">
                Days used for the reorder point when a product and its supplier have no lead time. Leave empty to not use one.
              </span>
              {saving === 'lead' && <span className="s-pref-status" role="status">Saving…</span>}
              {saved === 'lead' && <span className="s-pref-status" role="status"><Check size={11} /> Saved</span>}
            </div>
            <form
              className="s-name-field s-rules-lead"
              onSubmit={(event) => {
                event.preventDefault();
                if (leadChanged) save({ defaultLeadTimeDays: leadDraft === '' ? null : Number(leadDraft) }, 'lead');
              }}
            >
              <input
                id="s-rules-lead"
                type="number"
                min="0"
                max="365"
                step="1"
                inputMode="numeric"
                placeholder="not set"
                value={leadDraft}
                onChange={(event) => { setLeadDraft(limitDigits(event.target.value, { whole: 3 })); setError(''); }}
                disabled={saving !== ''}
              />
              <span className="s-rules-unit">days</span>
              <button type="submit" className="s-name-save" disabled={saving !== '' || !leadChanged || (leadDraft !== '' && Number(leadDraft) > 365)}>
                Save
              </button>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
