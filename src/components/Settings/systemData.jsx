import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, ChevronDown, Database, Download, FileUp, Lock, ShieldAlert, Trash2, X } from 'lucide-react';
import apiFetch from '../../apiFetch';

/* ===== DATA & SYSTEM (Super Admin only) =====
   Export a full backup, import one back, or reset parts of the data.
   Security (all checked again on the server):
     - Super Admin only (the routes refuse everyone else)
     - the password must be typed again for every action
     - import and reset also need a typed confirm phrase
     - 5 tries per 10 minutes, every try is written to the activity history
     - before an import or reset, the server saves a safety copy first */

const formatBytes = (bytes) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
};

/* Turn any failed response into one plain sentence. */
async function errorFrom(response) {
  if (response.status === 429) return 'Too many attempts. For safety, wait 10 minutes and try again.';
  if (response.status === 403) return 'Only the Super Admin can do this.';
  if (response.status === 413) return 'The file is bigger than the server allows. Raise upload_max_filesize and post_max_size in Laragon’s php.ini, restart Laragon, then try again.';
  const body = await response.json().catch(() => ({}));
  const first = body?.errors ? Object.values(body.errors).flat()[0] : null;
  return first || body?.message || `Something went wrong (${response.status}).`;
}

async function downloadBackup(password) {
  const response = await apiFetch('/api/system/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  if (!response.ok) throw new Error(await errorFrom(response));
  const blob = await response.blob();
  const name = response.headers.get('X-Backup-File') || `ggg-backup-${new Date().toISOString().slice(0, 10)}.gggbackup`;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { name, size: blob.size };
}

/* Shared pop-up frame. */
function Dialog({ title, icon, tone = '', onClose, busy, children }) {
  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);
  return createPortal(
    <div className="s-sys-overlay" onClick={() => !busy && onClose()}>
      <div className={`s-sys-dialog ${tone}`} role="dialog" aria-modal="true" aria-labelledby="s-sys-dialog-title" onClick={(event) => event.stopPropagation()}>
        <header className="s-sys-dialog-head">
          <span className="s-sys-dialog-icon" aria-hidden="true">{icon}</span>
          <h3 id="s-sys-dialog-title">{title}</h3>
          <button type="button" className="s-sys-close" onClick={onClose} disabled={busy} aria-label="Close"><X size={15} /></button>
        </header>
        {children}
      </div>
    </div>,
    document.body,
  );
}

function PasswordField({ value, onChange, autoFocus = false }) {
  return (
    <label className="s-sys-field">
      <span><Lock size={11} aria-hidden="true" /> Your password</span>
      <input type="password" autoComplete="current-password" value={value} onChange={(e) => onChange(e.target.value)} autoFocus={autoFocus} required />
    </label>
  );
}

function PhraseField({ phrase, value, onChange }) {
  const matches = value.trim() === phrase;
  return (
    <label className="s-sys-field">
      <span>Type <code>{phrase}</code> to confirm</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
        spellCheck={false}
        onPaste={(e) => e.preventDefault()}  /* typed on purpose, not pasted */
        className={value && !matches ? 'is-wrong' : matches ? 'is-right' : ''}
        required
      />
    </label>
  );
}

export default function SystemData() {
  const [open, setOpen] = useState(false);
  const [overview, setOverview] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [dialog, setDialog] = useState(null);   // 'export' | 'import' | 'reset'
  const [notice, setNotice] = useState('');

  const loadOverview = async () => {
    setLoadError('');
    try {
      const response = await fetch('/api/system/overview', { headers: { Accept: 'application/json' }, cache: 'no-store' });
      if (!response.ok) throw new Error(await errorFrom(response));
      setOverview(await response.json());
    } catch (error) {
      setLoadError(error.message || 'Could not load the data summary.');
    }
  };

  useEffect(() => { if (open) loadOverview(); }, [open]);

  const totalRows = overview ? Object.values(overview.tables || {}).reduce((sum, count) => sum + count, 0) : null;

  return (
    <section className={`s-card s-sys${open ? ' is-open' : ''}`} aria-labelledby="s-sys-title">
      <header className="s-card-head">
        <div className="s-card-head-main">
          <span className="s-pref-icon is-accent" aria-hidden="true"><Database size={15} /></span>
          <div className="s-card-titles">
            <h2 className="s-card-title" id="s-sys-title">
              Data &amp; System
              <span className="s-restricted-badge"><Lock size={9} /> Super Admin</span>
            </h2>
            <span className="s-card-sub">Back up, restore or reset the whole system. Every action asks for your password.</span>
          </div>
        </div>
        <button type="button" className="s-ghost-btn" aria-expanded={open} aria-controls="s-sys-body" onClick={() => setOpen((value) => !value)}>
          {open ? 'Hide' : 'Manage'} <ChevronDown size={13} className={open ? 's-roles-chevron is-open' : 's-roles-chevron'} />
        </button>
      </header>

      {open && (
        <div className="s-sys-body" id="s-sys-body">
          {loadError && <p className="s-policy-error" role="alert">{loadError}</p>}
          {notice && (
            <p className="s-sys-notice" role="status">
              {notice}
              <button type="button" onClick={() => setNotice('')} aria-label="Dismiss">×</button>
            </p>
          )}

          <div className="s-sys-row">
            <span className="s-sys-row-icon is-info" aria-hidden="true"><Download size={15} /></span>
            <div className="s-sys-row-text">
              <strong>Export backup</strong>
              <span>Downloads one file with every product, stock entry, sale, setting, account and photo{totalRows != null ? ` (${totalRows.toLocaleString('en-PH')} records)` : ''}. Keep it somewhere safe — it contains account details.</span>
            </div>
            <button type="button" className="s-ghost-btn" onClick={() => setDialog('export')}>Export</button>
          </div>

          <div className="s-sys-row">
            <span className="s-sys-row-icon is-warn" aria-hidden="true"><FileUp size={15} /></span>
            <div className="s-sys-row-text">
              <strong>Import backup</strong>
              <span>Replaces <b>all</b> current data with a backup file exported from this system. Everyone is signed out afterwards.</span>
            </div>
            <button type="button" className="s-ghost-btn" onClick={() => setDialog('import')} disabled={!overview}>Import</button>
          </div>

          <div className="s-sys-row is-danger">
            <span className="s-sys-row-icon is-danger" aria-hidden="true"><Trash2 size={15} /></span>
            <div className="s-sys-row-text">
              <strong>System reset</strong>
              <span>Permanently erases the parts of the data you choose. Super Admin accounts and settings are always kept.</span>
            </div>
            <button type="button" className="s-sys-danger-btn" onClick={() => setDialog('reset')} disabled={!overview}>Reset…</button>
          </div>

          <p className="s-roles-note hint-text">
            Before any import or reset, the server keeps a safety copy of the current data
            (the newest 5, in <code>storage/app/private/system-backups</code>).
          </p>
        </div>
      )}

      {dialog === 'export' && (
        <ExportDialog onClose={() => setDialog(null)} onDone={(text) => { setDialog(null); setNotice(text); }} />
      )}
      {dialog === 'import' && overview && (
        <ImportDialog overview={overview} onClose={() => setDialog(null)} />
      )}
      {dialog === 'reset' && overview && (
        <ResetDialog
          overview={overview}
          onClose={() => setDialog(null)}
          onDone={(text) => { setDialog(null); setNotice(text); loadOverview(); }}
        />
      )}
    </section>
  );
}

/* ----- Export ----- */
function ExportDialog({ onClose, onDone }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { name, size } = await downloadBackup(password);
      onDone(`Backup downloaded: ${name} (${formatBytes(size)}).`);
    } catch (exportError) {
      setError(exportError.message);
      setBusy(false);
    }
  };

  return (
    <Dialog title="Export backup" icon={<Download size={16} />} onClose={onClose} busy={busy}>
      <form className="s-sys-form" onSubmit={submit}>
        <p className="s-sys-text">The file can be imported back into this system later. Anyone with the file can read the shop’s data, so don’t share it.</p>
        <PasswordField value={password} onChange={setPassword} autoFocus />
        {error && <p className="s-policy-error" role="alert">{error}</p>}
        <div className="s-sys-actions">
          <button type="button" className="s-ghost-btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="s-primary-btn" disabled={busy || !password}>{busy ? 'Preparing file…' : 'Download backup'}</button>
        </div>
      </form>
    </Dialog>
  );
}

/* ----- Import ----- */
function ImportDialog({ overview, onClose }) {
  const [file, setFile] = useState(null);
  const [password, setPassword] = useState('');
  const [phrase, setPhrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const inputRef = useRef(null);
  const limit = overview.uploadLimitBytes;
  const tooBig = file && Number.isFinite(limit) && file.size > limit;

  const submit = async (event) => {
    event.preventDefault();
    if (!file || tooBig) return;
    setBusy(true);
    setError('');
    try {
      const form = new FormData();
      form.append('backup', file);
      form.append('password', password);
      form.append('confirmPhrase', phrase);
      const response = await apiFetch('/api/system/import', { method: 'POST', body: form });
      if (!response.ok) throw new Error(await errorFrom(response));
      const body = await response.json();
      setDone(body.message || 'The backup was imported.');
      // Everyone was signed out: go back to the login screen.
      setTimeout(() => window.location.reload(), 2500);
    } catch (importError) {
      setError(importError.message);
      setBusy(false);
    }
  };

  return (
    <Dialog title="Import backup" icon={<FileUp size={16} />} tone="is-warn" onClose={onClose} busy={busy || Boolean(done)}>
      {done ? (
        <p className="s-sys-success" role="status">{done} Taking you to the login screen…</p>
      ) : (
        <form className="s-sys-form" onSubmit={submit}>
          <p className="s-sys-warning">
            <AlertTriangle size={14} aria-hidden="true" />
            <span>Everything in the system now — products, stock, sales, accounts and settings — is <b>replaced</b> by the backup. The file is checked first: a damaged or edited file is refused and nothing changes.</span>
          </p>

          <div className="s-sys-file">
            <input ref={inputRef} type="file" accept=".gggbackup,.json,.gz" onChange={(e) => setFile(e.target.files?.[0] || null)} hidden />
            <button type="button" className="s-ghost-btn" onClick={() => inputRef.current?.click()}><FileUp size={13} /> Choose backup file</button>
            <span className={tooBig ? 's-sys-file-name is-wrong' : 's-sys-file-name'}>
              {file ? `${file.name} · ${formatBytes(file.size)}` : 'No file chosen'}
            </span>
          </div>
          {tooBig && (
            <p className="s-policy-error" role="alert">
              This file is {formatBytes(file.size)}, but the server accepts up to {formatBytes(limit)}. Raise upload_max_filesize and post_max_size in Laragon’s php.ini, restart Laragon, then try again.
            </p>
          )}

          <PasswordField value={password} onChange={setPassword} />
          <PhraseField phrase={overview.importPhrase} value={phrase} onChange={setPhrase} />
          {error && <p className="s-policy-error" role="alert">{error}</p>}
          <div className="s-sys-actions">
            <button type="button" className="s-ghost-btn" onClick={onClose} disabled={busy}>Cancel</button>
            <button type="submit" className="s-sys-danger-btn" disabled={busy || !file || tooBig || !password || phrase.trim() !== overview.importPhrase}>
              {busy ? 'Checking and importing…' : 'Replace all data'}
            </button>
          </div>
        </form>
      )}
    </Dialog>
  );
}

/* ----- Reset ----- */
const DEFAULT_GROUPS = ['stock', 'sales', 'history'];

function ResetDialog({ overview, onClose, onDone }) {
  const [chosen, setChosen] = useState(new Set(DEFAULT_GROUPS));
  const [password, setPassword] = useState('');
  const [phrase, setPhrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [backupNote, setBackupNote] = useState('');

  // Erasing products also erases what is linked to them.
  const forced = chosen.has('catalog') ? new Set(['stock', 'sales']) : new Set();
  const effective = new Set([...chosen, ...forced]);
  const rowsToErase = overview.groups.filter((group) => effective.has(group.key)).reduce((sum, group) => sum + group.rows, 0);

  const toggle = (key) => setChosen((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const backupFirst = async () => {
    setError('');
    setBackupNote('Preparing backup…');
    try {
      const { name } = await downloadBackup(password);
      setBackupNote(`Backup downloaded: ${name}`);
    } catch (exportError) {
      setBackupNote('');
      setError(exportError.message);
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await apiFetch('/api/system/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groups: [...effective], password, confirmPhrase: phrase }),
      });
      if (!response.ok) throw new Error(await errorFrom(response));
      const body = await response.json();
      const total = Object.values(body.erased || {}).reduce((sum, count) => sum + count, 0);
      onDone(`System reset finished: ${total.toLocaleString('en-PH')} records erased. A safety copy was kept on the server (${body.safetyCopy}).`);
    } catch (resetError) {
      setError(resetError.message);
      setBusy(false);
    }
  };

  return (
    <Dialog title="System reset" icon={<ShieldAlert size={16} />} tone="is-danger" onClose={onClose} busy={busy}>
      <form className="s-sys-form" onSubmit={submit}>
        <p className="s-sys-warning is-danger">
          <AlertTriangle size={14} aria-hidden="true" />
          <span>This <b>cannot be undone</b> from this screen. Download a backup first if you might need the data again.</span>
        </p>

        <fieldset className="s-sys-groups">
          <legend>What to erase</legend>
          {overview.groups.map((group) => {
            const isForced = forced.has(group.key);
            return (
              <label key={group.key} className={`s-sys-group${effective.has(group.key) ? ' is-on' : ''}`}>
                <input type="checkbox" checked={effective.has(group.key)} disabled={isForced} onChange={() => toggle(group.key)} />
                <span className="s-sys-group-text">
                  <strong>{group.label} <small>{group.rows.toLocaleString('en-PH')} {group.rows === 1 ? 'record' : 'records'}</small></strong>
                  <span>{isForced ? 'Included because products are erased. ' : ''}{group.description}</span>
                </span>
              </label>
            );
          })}
        </fieldset>

        <PasswordField value={password} onChange={setPassword} />
        <div className="s-sys-backup-first">
          <button type="button" className="s-ghost-btn" onClick={backupFirst} disabled={!password || busy}><Download size={13} /> Download a backup first</button>
          {backupNote && <small>{backupNote}</small>}
        </div>
        <PhraseField phrase={overview.resetPhrase} value={phrase} onChange={setPhrase} />
        {error && <p className="s-policy-error" role="alert">{error}</p>}

        <div className="s-sys-actions">
          <button type="button" className="s-ghost-btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="s-sys-danger-btn" disabled={busy || effective.size === 0 || !password || phrase.trim() !== overview.resetPhrase}>
            {busy ? 'Erasing…' : `Erase ${rowsToErase.toLocaleString('en-PH')} records`}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
