import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle, CalendarDays, Package, RotateCcw, Search, Trash2, Truck, X, ArrowLeftRight,
} from 'lucide-react';

/* Reuses Stock Control's table, button and popup styles so the page looks the same. */
import '../StockControl/stockControl.css';
import './trashBin.css';
import apiFetch from '../../apiFetch';
import { useCurrency } from '../../CurrencyContext';

/* ===== TRASH BIN =====
   Deleted products, stock entries, suppliers and seasonal events land here
   instead of being erased. Each item shows what it was, who deleted it and
   when. Allowed users can Restore (it comes back exactly as it was) or
   Permanently delete — one item, several ticked items, or everything
   ("Empty Trash Bin"). Permanent deletion always asks for the password.
   Role Access decides who sees which button; the server checks the same boxes.

   Safety checks:
   - a stock entry can't come back while its product is still in the Trash Bin
   - restoring a product also brings back its supplier if that was deleted too
   - restoring several at once does suppliers → products → entries in order */

const KINDS = [
  { key: 'all', label: 'All', Icon: Trash2 },
  { key: 'product', label: 'Products', Icon: Package },
  { key: 'entry', label: 'Stock entries', Icon: ArrowLeftRight },
  { key: 'supplier', label: 'Suppliers', Icon: Truck },
  { key: 'event', label: 'Seasonal events', Icon: CalendarDays },
];

const URL_BASE = {
  product: (id) => `/api/trash/products/${encodeURIComponent(id)}`,
  entry: (id) => `/api/trash/stock-movements/${id}`,
  supplier: (id) => `/api/trash/suppliers/${id}`,
  event: (id) => `/api/trash/seasonal-events/${id}`,
};

const formatWhen = (iso) => {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });
};

const daysText = (days) => (days <= 0 ? 'today' : days === 1 ? '1 day ago' : `${days} days ago`);

const firstError = (result, fallback) => (
  result?.errors ? Object.values(result.errors).flat()[0] : result?.message
) || fallback;

const keyOf = (item) => `${item.kind}-${item.id}`;
const signed = (n) => `${n >= 0 ? '+' : '−'}${Math.abs(n)}`;

function TrashBin({
  isActive = false,
  refreshKey = 0,
  onRestored,
  canRestore = false,
  canPurge = false,
}) {
  const { formatCurrency } = useCurrency();
  const [records, setRecords] = useState([]);
  const [counts, setCounts] = useState({ all: 0, product: 0, entry: 0, supplier: 0, event: 0 });
  const [deleters, setDeleters] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, perPage: 50, lastPage: 1, total: 0 });
  const [page, setPage] = useState(1);
  const [kind, setKind] = useState('all');
  const [deletedBy, setDeletedBy] = useState('');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState(new Map());   // key → item
  const [confirm, setConfirm] = useState(null);           // { action, items } | { action: 'empty' }
  const [currentPassword, setCurrentPassword] = useState('');
  const requestRef = useRef(0);

  const load = async () => {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), per_page: String(pagination.perPage), kind });
      if (query.trim()) params.set('search', query.trim());
      if (deletedBy) params.set('deleted_by', deletedBy);
      const response = await fetch(`/api/trash?${params}`, { cache: 'no-store', headers: { Accept: 'application/json' } });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(firstError(result, `Could not load the Trash Bin (${response.status}).`));
      if (requestId !== requestRef.current) return;
      setRecords(Array.isArray(result.records) ? result.records : []);
      setCounts(result.counts || counts);
      setDeleters(Array.isArray(result.deleters) ? result.deleters : []);
      setPagination(result.pagination || { page, perPage: 50, lastPage: 1, total: 0 });
      setError('');
    } catch (loadError) {
      if (requestId === requestRef.current) setError(loadError.message || 'Could not load the Trash Bin.');
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    if (!isActive) return undefined;
    const timeout = window.setTimeout(load, 200);
    return () => window.clearTimeout(timeout);
  }, [isActive, refreshKey, page, query, kind, deletedBy]);

  // A new tab / filter / search starts at page 1 with nothing ticked.
  useEffect(() => { setPage(1); setSelected(new Map()); }, [kind, deletedBy, query]);

  /* ----- what can be done with an item ----- */
  const restoreBlockedReason = (item) => {
    if (item.kind !== 'entry') return '';
    if (item.productInTrash) return 'Restore its product first (it is also in the Trash Bin).';
    if (item.productMissing) return 'Its product was permanently deleted, so it can’t come back.';
    return '';
  };

  /* ----- selection ----- */
  const toggle = (item) => setSelected((prev) => {
    const next = new Map(prev);
    if (next.has(keyOf(item))) next.delete(keyOf(item)); else next.set(keyOf(item), item);
    return next;
  });
  const allOnPageSelected = records.length > 0 && records.every((item) => selected.has(keyOf(item)));
  const togglePage = () => setSelected((prev) => {
    const next = new Map(prev);
    records.forEach((item) => (allOnPageSelected ? next.delete(keyOf(item)) : next.set(keyOf(item), item)));
    return next;
  });
  const selectedItems = useMemo(() => [...selected.values()], [selected]);

  /* ----- actions ----- */
  const finish = async (text) => {
    setNotice(text);
    setError('');
    setSelected(new Map());
    await load();
    onRestored?.();   // Stock Control, Products, Dashboard reload their numbers
  };

  const send = async (url, method, body) => {
    const response = await apiFetch(url, {
      method,
      headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(firstError(result, `That didn't work (${response.status}).`));
    return result;
  };

  const runConfirmed = async () => {
    if (!confirm || busy) return;
    setBusy(true);
    setError('');
    try {
      if (confirm.action === 'empty') {
        const result = await send('/api/trash', 'DELETE', { current_password: currentPassword });
        await finish(`The Trash Bin was emptied — ${result.deleted} item${result.deleted === 1 ? '' : 's'} permanently deleted.`);
      } else if (confirm.items.length === 1) {
        const [item] = confirm.items;
        if (confirm.action === 'restore') {
          const result = await send(`${URL_BASE[item.kind](item.id)}/restore`, 'POST');
          const extra = [
            result.restoredEntries ? `with ${result.restoredEntries} stock entr${result.restoredEntries === 1 ? 'y' : 'ies'}` : '',
            result.restoredSupplier ? `and its supplier ${result.restoredSupplier}` : '',
          ].filter(Boolean).join(' ');
          await finish(`${item.productName} was restored${extra ? ` ${extra}` : ''}.`);
        } else {
          await send(URL_BASE[item.kind](item.id), 'DELETE', { current_password: currentPassword });
          await finish(`${item.productName} (${item.type}) was permanently deleted.`);
        }
      } else {
        const result = await send('/api/trash/bulk', 'POST', {
          action: confirm.action,
          items: confirm.items.map((item) => ({ kind: item.kind, id: item.id })),
          ...(confirm.action === 'purge' ? { current_password: currentPassword } : {}),
        });
        const verb = confirm.action === 'restore' ? 'restored' : 'permanently deleted';
        const failedText = result.failed?.length
          ? ` ${result.failed.length} could not be ${verb}: ${result.failed.map((f) => f.message).filter(Boolean).slice(0, 2).join(' ')}`
          : '';
        await finish(`${result.done} item${result.done === 1 ? '' : 's'} ${verb}.${failedText}`);
      }
      setConfirm(null);
    } catch (actionError) {
      setError(actionError.message || "That didn't work.");
    } finally {
      setCurrentPassword('');
      setBusy(false);
    }
  };

  const openConfirm = (action, items) => {
    setError('');
    setCurrentPassword('');
    setConfirm({ action, items });
  };
  const closeConfirm = () => { if (!busy) { setConfirm(null); setCurrentPassword(''); } };

  const bulkRestorable = selectedItems.filter((item) => !restoreBlockedReason(item));

  /* ----- display helpers ----- */
  const subtitle = (item) => {
    if (item.kind === 'product') return [item.productId, item.category].filter(Boolean).join(' · ');
    if (item.kind === 'entry') return [item.productId, item.variantName].filter(Boolean).join(' · ');
    if (item.kind === 'supplier') return item.details.company && item.details.company !== item.productName ? item.details.company : 'Supplier';
    return 'Seasonal event';
  };

  const detailsText = (item) => {
    const d = item.details || {};
    switch (item.kind) {
      case 'product':
        return [
          d.brand ? `Brand: ${d.brand}` : null,
          `Stock on hand: ${d.stockOnHand}`,
          d.supplier ? `Supplier: ${d.supplier}${d.supplierInTrash ? ' (also in Trash Bin — comes back with it)' : ''}` : null,
        ].filter(Boolean).join(' · ');
      case 'entry':
        return [
          d.movementType,
          `Qty ${signed(d.quantity)}`,
          d.unitPrice != null ? `Price ${formatCurrency(d.unitPrice)}` : null,
          `Recorded ${d.movementDate || '—'} by ${d.recordedBy || '—'}`,
          d.notes || null,
        ].filter(Boolean).join(' · ');
      case 'supplier':
        return [
          d.contact ? `Contact: ${d.contact}` : null,
          d.leadTimeDays != null ? `Lead time: ${d.leadTimeDays} days` : null,
          `${d.linkedProducts} linked product${d.linkedProducts === 1 ? '' : 's'}`,
        ].filter(Boolean).join(' · ');
      default:
        return [
          `${d.startDate} → ${d.endDate}`,
          `${d.adjustmentPct > 0 ? '+' : ''}${d.adjustmentPct}% demand`,
          d.scope === 'all' ? 'All products' : d.scope === 'categories' ? 'Some categories' : 'Some products',
        ].join(' · ');
    }
  };

  const purgeWarning = (items) => {
    const kinds = new Set(items.map((item) => item.kind));
    const lines = [];
    if (kinds.has('product')) lines.push('Products: their settings and restock requests are erased; past stock entries and sales stay as history.');
    if (kinds.has('entry')) lines.push('Stock entries: the stock total does not change (it was already taken out when the entry was deleted).');
    if (kinds.has('supplier')) lines.push('Suppliers: their products stay, but will have no supplier.');
    if (kinds.has('event')) lines.push('Seasonal events: removed for good from forecasting.');
    return lines;
  };

  const confirmTitle = !confirm ? '' : confirm.action === 'empty'
    ? 'Empty the Trash Bin?'
    : confirm.action === 'restore'
      ? (confirm.items.length === 1 ? 'Restore this item?' : `Restore ${confirm.items.length} items?`)
      : (confirm.items.length === 1 ? 'Delete permanently?' : `Permanently delete ${confirm.items.length} items?`);
  const needsPassword = confirm && confirm.action !== 'restore';

  return (
    <div className="sc-table-parent tb-page">
      {/* ===== TABS ===== */}
      <div className="tb-tabs" role="tablist" aria-label="What to show">
        {KINDS.map(({ key, label, Icon }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={kind === key}
            className={kind === key ? 'is-active' : ''}
            onClick={() => setKind(key)}
          >
            <Icon size={13} aria-hidden="true" /> {label}
            <span className="tb-tab-count">{counts[key] ?? 0}</span>
          </button>
        ))}
      </div>

      {/* ===== TOOLBAR ===== */}
      <div className="tb-toolbar">
        <div className="sc-search-box tb-search">
          <Search size={13} className="sc-search-icon" />
          <input type="search" placeholder="Search the Trash Bin…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search the Trash Bin" />
        </div>
        <label className="tb-filter">
          <span>Deleted by</span>
          <select value={deletedBy} onChange={(e) => setDeletedBy(e.target.value)}>
            <option value="">Anyone</option>
            {deleters.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>
        {canPurge && (
          <button
            type="button"
            className="sc-add-btn tb-empty-btn"
            onClick={() => openConfirm('empty', [])}
            disabled={!counts.all || busy}
            title="Permanently delete everything in the Trash Bin"
          >
            <Trash2 size={13} aria-hidden="true" /> Empty Trash Bin
          </button>
        )}
      </div>

      <p className="tb-hint">
        {pagination.total} {pagination.total === 1 ? 'item' : 'items'} shown. Items in the Trash Bin are left out of stock totals, reports and forecasts until restored.
      </p>

      {error && !confirm && (
        <div className="sc-error-banner" role="alert">
          <span>{error}</span>
          <button type="button" onClick={load}>Retry</button>
        </div>
      )}
      {notice && (
        <div className="sc-merge-notice" role="status">
          <span>{notice}</span>
          <button type="button" className="sc-safety-alert-close" onClick={() => setNotice('')} aria-label="Dismiss"><X size={14} /></button>
        </div>
      )}

      {/* ===== BULK BAR ===== */}
      {selectedItems.length > 0 && (canRestore || canPurge) && (
        <div className="tb-bulk-bar" role="region" aria-label="Selected items">
          <strong>{selectedItems.length} selected</strong>
          {canRestore && (
            <button type="button" className="sc-add-btn" onClick={() => openConfirm('restore', bulkRestorable)} disabled={!bulkRestorable.length || busy}
              title={bulkRestorable.length < selectedItems.length ? 'Some ticked stock entries can’t be restored yet and will be skipped' : 'Restore every ticked item'}>
              <RotateCcw size={13} aria-hidden="true" /> Restore{bulkRestorable.length !== selectedItems.length ? ` ${bulkRestorable.length}` : ''}
            </button>
          )}
          {canPurge && (
            <button type="button" className="sc-add-btn tb-danger-outline" onClick={() => openConfirm('purge', selectedItems)} disabled={busy}>
              <Trash2 size={13} aria-hidden="true" /> Delete permanently
            </button>
          )}
          <button type="button" className="sc-add-btn" onClick={() => setSelected(new Map())}>Clear</button>
        </div>
      )}

      {/* ===== TABLE ===== */}
      <div className="sc-table-scroll">
        <table className="sc-table m-folders tb-unified-table">
          <thead>
            <tr>
              {(canRestore || canPurge) && (
                <th className="sc-th-check"><input type="checkbox" checked={allOnPageSelected} onChange={togglePage} aria-label="Select all on this page" /></th>
              )}
              <th className="sc-th-left">Name</th>
              <th>Type</th>
              <th className="sc-th-left">Details</th>
              <th>Deleted by</th>
              <th>Deleted on</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && records.length === 0 ? (
              <tr><td colSpan={7} className="sc-empty-state">Loading the Trash Bin…</td></tr>
            ) : records.length === 0 ? (
              <tr>
                <td colSpan={7} className="sc-empty-state">
                  {query || deletedBy || kind !== 'all' ? 'Nothing in the Trash Bin matches.' : 'The Trash Bin is empty.'}
                </td>
              </tr>
            ) : records.map((item) => {
              const blocked = restoreBlockedReason(item);
              const KindIcon = KINDS.find((k) => k.key === item.kind)?.Icon || Trash2;
              return (
                <tr key={keyOf(item)} className={selected.has(keyOf(item)) ? 'is-selected' : ''}>
                  {(canRestore || canPurge) && (
                    <td className="sc-td-check m-keep">
                      <input type="checkbox" checked={selected.has(keyOf(item))} onChange={() => toggle(item)} aria-label={`Select ${item.type}: ${item.productName}`} />
                    </td>
                  )}
                  <td className="sc-td-left m-title" data-label="Name">
                    <span className="sc-name-cell">
                      <span className={`tb-kind-icon tb-kind-${item.kind}`} aria-hidden="true"><KindIcon size={13} /></span>
                      <span className="tb-name">
                        <strong>{item.productName}</strong>
                        <small>{subtitle(item)}</small>
                        {blocked && <small className="sc-deleted-tag">{item.productInTrash ? 'Product is in the Trash Bin' : 'Product permanently deleted'}</small>}
                      </span>
                    </span>
                  </td>
                  <td className="m-peek" data-label="Type"><span className={`tb-type tb-type-${item.kind}`}>{item.type}</span></td>
                  <td className="sc-td-left tb-details" data-label="Details" title={detailsText(item)}>{detailsText(item)}</td>
                  <td className="sc-td-nowrap" data-label="Deleted by">{item.deletedBy || '—'}</td>
                  <td className="sc-td-nowrap" data-label="Deleted on">
                    <span className="tb-when">
                      <span>{formatWhen(item.deletedAt)}</span>
                      <small>{daysText(item.daysInTrash)}</small>
                    </span>
                  </td>
                  <td className="sc-td-actions" data-label="Actions">
                    <div className="sc-action-cell-container">
                      {canRestore && (
                        <button
                          type="button"
                          className="sc-table-action-btn sc-history-btn"
                          onClick={() => openConfirm('restore', [item])}
                          disabled={busy || Boolean(blocked)}
                          title={blocked || `Restore this ${item.type.toLowerCase()}`}
                          aria-label={`Restore ${item.type}: ${item.productName}`}
                        >
                          <RotateCcw size={14} />
                        </button>
                      )}
                      {canPurge && (
                        <button type="button" className="sc-table-action-btn sc-delete-btn" onClick={() => openConfirm('purge', [item])} disabled={busy}
                          title="Delete permanently" aria-label={`Permanently delete ${item.type}: ${item.productName}`}>
                          <Trash2 size={14} />
                        </button>
                      )}
                      {!canRestore && !canPurge && '—'}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {pagination.lastPage > 1 && (
        <div className="tb-pagination" aria-label="Trash Bin pages">
          <span>Page {pagination.page} of {pagination.lastPage}</span>
          <div>
            <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={loading || pagination.page <= 1}>Previous</button>
            <button type="button" onClick={() => setPage((current) => Math.min(pagination.lastPage, current + 1))} disabled={loading || pagination.page >= pagination.lastPage}>Next</button>
          </div>
        </div>
      )}

      {/* ===== CONFIRM ===== */}
      {confirm && createPortal(
        <div className="sc-modal-overlay sc-confirm-overlay" onClick={closeConfirm}>
          <div className={`sc-modal sc-confirm-modal${needsPassword ? ' tb-purge-modal' : ''}`} onClick={(e) => e.stopPropagation()} role="alertdialog" aria-modal="true" aria-labelledby="tb-confirm-title" aria-describedby="tb-confirm-text">
            <span className={`sc-confirm-icon ${needsPassword ? 'is-out' : 'is-safe'}`} aria-hidden="true">
              {needsPassword ? <AlertTriangle size={22} /> : <RotateCcw size={22} />}
            </span>
            <h3 id="tb-confirm-title">{confirmTitle}</h3>
            <div id="tb-confirm-text" className="tb-confirm-text">
              {confirm.action === 'empty' ? (
                <p>
                  All <strong>{counts.all}</strong> items will be erased for good:
                  {' '}{counts.product} product{counts.product === 1 ? '' : 's'}, {counts.entry} stock entr{counts.entry === 1 ? 'y' : 'ies'},
                  {' '}{counts.supplier} supplier{counts.supplier === 1 ? '' : 's'} and {counts.event} seasonal event{counts.event === 1 ? '' : 's'}.
                </p>
              ) : confirm.items.length === 1 ? (
                <p>
                  <strong>{confirm.items[0].productName}</strong> · {confirm.items[0].type}
                  <span className="sc-confirm-detail">{detailsText(confirm.items[0])}</span>
                </p>
              ) : (
                <ul className="tb-confirm-list">
                  {confirm.items.slice(0, 6).map((item) => <li key={keyOf(item)}>{item.productName} <small>({item.type})</small></li>)}
                  {confirm.items.length > 6 && <li>…and {confirm.items.length - 6} more</li>}
                </ul>
              )}
              {confirm.action === 'restore' && confirm.items.some((item) => item.kind === 'product') && (
                <p className="tb-confirm-note">Products come back with the stock entries deleted with them (and their supplier, if it was deleted too).</p>
              )}
              {needsPassword && (
                <>
                  {(confirm.action === 'empty' ? purgeWarning([{ kind: 'product' }, { kind: 'entry' }, { kind: 'supplier' }, { kind: 'event' }]) : purgeWarning(confirm.items))
                    .map((line) => <p key={line} className="tb-confirm-note">{line}</p>)}
                  <p className="sc-confirm-detail">This can’t be undone. Enter your current password to confirm.</p>
                </>
              )}
            </div>
            {needsPassword && (
              <label className="tb-password-field">
                Current password
                <input
                  type="password"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  onKeyDown={(event) => { if (event.key === 'Enter' && currentPassword) runConfirmed(); }}
                  aria-label="Current password to confirm permanent deletion"
                  autoFocus
                  required
                />
              </label>
            )}
            {error && <p className="tb-confirm-error" role="alert">{error}</p>}
            <div className="sc-modal-actions">
              <button type="button" className="sc-modal-cancel-btn" onClick={closeConfirm} disabled={busy} autoFocus={!needsPassword}>Cancel</button>
              {confirm.action === 'restore' ? (
                <button type="button" className="sc-modal-save-btn" onClick={runConfirmed} disabled={busy}>
                  {busy ? 'Restoring…' : 'Restore'}
                </button>
              ) : (
                <button type="button" className="sc-modal-save-btn sc-confirm-danger-btn" onClick={runConfirmed} disabled={!currentPassword || busy}>
                  {busy ? 'Deleting…' : confirm.action === 'empty' ? 'Empty Trash Bin' : 'Delete permanently'}
                </button>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

export default TrashBin;
