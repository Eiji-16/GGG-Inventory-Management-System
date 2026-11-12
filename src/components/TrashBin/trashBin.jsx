import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PageToast } from '../../utils/toast';
import { createPortal } from 'react-dom';
import useFillToBottom from '../../utils/fillToBottom';
import {
  Archive,
  Ban,
  CalendarDays,
  Package,
  RotateCcw,
  Search,
  Trash2,
  Truck,
  UserRound,
  ArrowLeftRight,
} from 'lucide-react';

/* Reuses Stock Control's table, button and popup styles so the page looks the same. */
import '../StockControl/stockControl.css';
import './trashBin.css';
import apiFetch from '../../apiFetch';
import { useCurrency } from '../../CurrencyContext';
import CustomSelect from '../Forecasting/CustomSelect';

/* ===== TRASH BIN AND ARCHIVE =====
   Trash items can be restored or archived. Archived items can be restored or
   permanently deleted. The Super Admin can do everything; an Admin with
   Role Access "Open Trash Bin and restore" gets restoreOnly: Trash Bin only
   (no Archive tab), no Accounts tab, and only the Restore button (2026-11-11). */

const KINDS = [
  { key: 'all', label: 'All', Icon: Trash2 },
  { key: 'product', label: 'Products', Icon: Package },
  { key: 'account', label: 'Accounts', Icon: UserRound },
  { key: 'entry', label: 'Stock entries', Icon: ArrowLeftRight },
  { key: 'supplier', label: 'Suppliers', Icon: Truck },
  { key: 'event', label: 'Seasonal events', Icon: CalendarDays },
];

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

function TrashBin({ isActive = false, refreshKey = 0, onRestored, embedded = false, restoreOnly = false }) {
  const kindTabs = restoreOnly ? KINDS.filter((tab) => tab.key !== 'account') : KINDS;
  const { formatCurrency } = useCurrency();
  // The table stretches to the bottom of the page (no empty space under it).
  const fillTableToBottom = useFillToBottom(4, { shrink: true });   // full page fills the box; a short last page shrinks
  const [records, setRecords] = useState([]);
  const [space, setSpace] = useState('trash');
  const [counts, setCounts] = useState({ all: 0, product: 0, account: 0, entry: 0, supplier: 0, event: 0 });
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
  const requestRef = useRef(0);

  const changeSpace = (nextSpace) => {
    setSpace(nextSpace);
    setDeletedBy('');
  };

  const load = async () => {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    setLoading(true);
    try {
      const params = new URLSearchParams({ space, page: String(page), per_page: String(pagination.perPage), kind });
      if (query.trim()) params.set('search', query.trim());
      if (deletedBy) params.set(space === 'trash' ? 'deleted_by' : 'archived_by', deletedBy);
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
  }, [isActive, refreshKey, page, query, kind, deletedBy, space]);

  // A new tab / filter / search starts at page 1 with nothing ticked.
  useEffect(() => { setPage(1); setSelected(new Map());   }, [kind, deletedBy, query, space]);

  /* ----- what can be done with an item ----- */
  const restoreBlockedReason = (item) => {
    if (item.kind !== 'entry') return '';
    if (item.productInTrash) return `Restore its product first (it is also in the ${space === 'trash' ? 'Trash Bin' : 'Archive'}).`;
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
      const result = await send('/api/trash/bulk', 'POST', {
        space,
        action: confirm.action,
        items: confirm.items.map((item) => ({ kind: item.kind, id: item.id })),
      });
      const verb = confirm.action === 'restore' ? 'restored' : confirm.action === 'archive' ? 'archived' : 'permanently deleted';
      const failedText = result.failed?.length
        ? ` ${result.failed.length} could not be ${verb}: ${result.failed.map((f) => f.message).filter(Boolean).slice(0, 2).join(' ')}`
        : '';
      await finish(`${result.done} item${result.done === 1 ? '' : 's'} ${verb}.${failedText}`);
      setConfirm(null);
    } catch (actionError) {
      setError(actionError.message || "That didn't work.");
    } finally {
      setBusy(false);
    }
  };

  const openConfirm = (action, items) => {
    setError('');
    setConfirm({ action, items });
  };
  const closeConfirm = () => { if (!busy) setConfirm(null); };

  const bulkRestorable = selectedItems.filter((item) => !restoreBlockedReason(item));

  /* ----- display helpers ----- */
  const subtitle = (item) => {
    if (item.kind === 'product') return [item.productId, item.category].filter(Boolean).join(' · ');
    if (item.kind === 'account') return item.details.email;
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
      case 'account':
        return [d.role, d.status, d.department].filter(Boolean).join(' · ');
      default:
        return [
          `${d.startDate} → ${d.endDate}`,
          `${d.adjustmentPct > 0 ? '+' : ''}${d.adjustmentPct}% demand`,
          d.scope === 'all' ? 'All products' : d.scope === 'categories' ? 'Some categories' : 'Some products',
        ].join(' · ');
    }
  };

  const confirmTitle = !confirm ? '' : confirm.action === 'restore'
    ? (confirm.items.length === 1 ? 'Restore this item?' : `Restore ${confirm.items.length} items?`)
    : confirm.action === 'archive'
      ? (confirm.items.length === 1 ? 'Move this item to Archive?' : `Move ${confirm.items.length} items to Archive?`)
      : (confirm.items.length === 1 ? 'Delete permanently?' : `Permanently delete ${confirm.items.length} items?`);
  const isPurge = confirm?.action === 'purge';

  return (
    <div className={`sc-table-parent tb-page${embedded ? ' tb-page-embedded' : ''}`}>
      {!restoreOnly && (
      <div className="tb-tabs tb-space-tabs" role="tablist" aria-label="Retention area">
        <button type="button" role="tab" aria-selected={space === 'trash'} className={space === 'trash' ? 'is-active' : ''} onClick={() => changeSpace('trash')}>
          <Trash2 size={13} aria-hidden="true" /> Trash Bin
        </button>
        <button type="button" role="tab" aria-selected={space === 'archive'} className={space === 'archive' ? 'is-active' : ''} onClick={() => changeSpace('archive')}>
          <Archive size={13} aria-hidden="true" /> Archive
        </button>
      </div>
      )}

      <div className="tb-toolbar">
        <div className="tb-tabs" role="tablist" aria-label="What to show">
          {kindTabs.map(({ key, label, Icon }) => (
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
        {/* Search + "Deleted by" stay together: when the row is full they
            move to the next row as one group (search left, filter right). */}
        <div className="tb-toolbar-tools">
        <div className="sc-search-box tb-search xs-search">
          <Search size={13} className="sc-search-icon" />
          <input autoComplete="off" type="search" placeholder={`Search ${space === 'trash' ? 'Trash Bin' : 'Archive'}…`} value={query} onChange={(e) => setQuery(e.target.value)} aria-label={`Search ${space === 'trash' ? 'Trash Bin' : 'Archive'}`} />
        </div>
        <div className="tb-filter">
          <span>{space === 'trash' ? 'Deleted by' : 'Archived by'}</span>
          <CustomSelect
            id="tb-deleted-by"
            className="tb-deleted-by-select"
            value={deletedBy}
            onChange={setDeletedBy}
            ariaLabel={`Filter by ${space === 'trash' ? 'deleted' : 'archived'} by`}
            options={[
              { value: '', label: 'Anyone' },
              ...deleters.map((name) => ({ value: name, label: name })),
            ]}
          />
        </div>
        </div>
      </div>

      <p className="tb-hint">
        {pagination.total} {pagination.total === 1 ? 'item' : 'items'} shown.
        <span className="hint-text"> {restoreOnly ? 'Items can be restored. Only the Super Admin can archive or permanently delete.' : space === 'trash' ? 'Items can be restored or moved to Archive.' : 'Archived items can be restored or permanently deleted.'}</span>
      </p>

      {error && !confirm && (
        <div className="sc-error-banner" role="alert">
          <span>{error}</span>
          <button type="button" onClick={load}>Retry</button>
        </div>
      )}
      {/* Page messages show as a bottom-right pop-up (2026-11-06). */}
      <PageToast message={notice} type="success" onShown={() => setNotice('')} />

      {/* ===== BULK BAR ===== */}
      {selectedItems.length > 0 && (
        <div className="tb-bulk-bar" role="region" aria-label="Selected items">
          <strong>{selectedItems.length} selected</strong>
          <button type="button" className="sc-add-btn" onClick={() => openConfirm('restore', bulkRestorable)} disabled={!bulkRestorable.length || busy}
              title={bulkRestorable.length < selectedItems.length ? 'Some ticked stock entries can’t be restored yet and will be skipped' : 'Restore every ticked item'}>
            <RotateCcw size={13} aria-hidden="true" /> Restore{bulkRestorable.length !== selectedItems.length ? ` ${bulkRestorable.length}` : ''}
          </button>
          {restoreOnly ? null : space === 'trash' ? (
            <button type="button" className="sc-add-btn" onClick={() => openConfirm('archive', selectedItems)} disabled={busy}>
              <Trash2 size={13} aria-hidden="true" /> Archive
            </button>
          ) : (
            <button type="button" className="sc-add-btn tb-danger-outline" onClick={() => openConfirm('purge', selectedItems)} disabled={busy}>
              <Ban size={13} aria-hidden="true" /> Delete permanently
            </button>
          )}
          <button type="button" className="sc-add-btn" onClick={() => setSelected(new Map())}>Clear</button>
        </div>
      )}

      {/* ===== TABLE ===== */}
      <div className="sc-table-scroll" ref={embedded ? undefined : fillTableToBottom}>
        <table className="sc-table m-folders tb-unified-table">
          <thead>
            <tr>
              <th className="sc-th-check"><input type="checkbox" checked={allOnPageSelected} onChange={togglePage} aria-label="Select all on this page" /></th>
              <th className="sc-th-left">Name</th>
              <th>Type</th>
              <th className="sc-th-left">Details</th>
              <th>{space === 'trash' ? 'Deleted by' : 'Archived by'}</th>
              <th>{space === 'trash' ? 'Deleted on' : 'Archived on'}</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && records.length === 0 ? (
              <tr><td colSpan={7} className="sc-empty-state ui-loading">Loading {space === 'trash' ? 'Trash Bin' : 'Archive'}…</td></tr>
            ) : records.length === 0 ? (
              <tr>
                <td colSpan={7} className="sc-empty-state">
                  {query || deletedBy || kind !== 'all' ? `Nothing in the ${space === 'trash' ? 'Trash Bin' : 'Archive'} matches.` : `The ${space === 'trash' ? 'Trash Bin' : 'Archive'} is empty.`}
                </td>
              </tr>
            ) : records.map((item) => {
              const blocked = restoreBlockedReason(item);
              const KindIcon = KINDS.find((k) => k.key === item.kind)?.Icon || Trash2;
              return (
                <tr key={keyOf(item)} className={selected.has(keyOf(item)) ? 'is-selected' : ''}>
                  <td className="sc-td-check m-keep">
                    <input type="checkbox" checked={selected.has(keyOf(item))} onChange={() => toggle(item)} aria-label={`Select ${item.type}: ${item.productName}`} />
                  </td>
                  <td className="sc-td-left m-title" data-label="Name">
                    <span className="sc-name-cell">
                      <span className={`tb-kind-icon tb-kind-${item.kind}`} aria-hidden="true"><KindIcon size={13} /></span>
                      <span className="tb-name">
                        <strong>{item.productName}</strong>
                        <small>{subtitle(item)}</small>
                        {blocked && <small className="sc-deleted-tag">{item.productInTrash ? `Product is in the ${space === 'trash' ? 'Trash Bin' : 'Archive'}` : 'Product permanently deleted'}</small>}
                      </span>
                    </span>
                  </td>
                  <td className="m-peek" data-label="Type"><span className={`tb-type tb-type-${item.kind}`}>{item.type}</span></td>
                  <td className="sc-td-left tb-details" data-label="Details" title={detailsText(item)}>{detailsText(item)}</td>
                  <td className="sc-td-nowrap" data-label={space === 'trash' ? 'Deleted by' : 'Archived by'}>
                    {space === 'trash' ? item.deletedBy || '—' : item.archivedBy || '—'}
                  </td>
                  <td className="sc-td-nowrap" data-label={space === 'trash' ? 'Deleted on' : 'Archived on'}>
                    <span className="tb-when">
                      <span>{formatWhen(space === 'trash' ? item.deletedAt : item.archivedAt)}</span>
                      <small>{daysText(space === 'trash' ? item.daysInTrash : item.daysInArchive)}</small>
                    </span>
                  </td>
                  <td className="sc-td-actions" data-label="Actions">
                    <div className="sc-action-cell-container">
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
                      {restoreOnly ? null : space === 'trash' ? (
                        <button type="button" className="sc-table-action-btn sc-history-btn" onClick={() => openConfirm('archive', [item])} disabled={busy}
                          title="Move to Archive" aria-label={`Archive ${item.type}: ${item.productName}`}>
                          <Trash2 size={14} />
                        </button>
                      ) : (
                        <button type="button" className="sc-table-action-btn sc-delete-btn" onClick={() => openConfirm('purge', [item])} disabled={busy}
                          title="Delete permanently" aria-label={`Permanently delete ${item.type}: ${item.productName}`}>
                          <Ban size={14} />
                        </button>
                      )}
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
          <div className={`sc-modal sc-confirm-modal${isPurge ? ' tb-purge-modal' : ''}`} onClick={(e) => e.stopPropagation()} role="alertdialog" aria-modal="true" aria-labelledby="tb-confirm-title" aria-describedby="tb-confirm-text">
            <span className={`sc-confirm-icon ${isPurge ? 'is-out' : 'is-safe'}`} aria-hidden="true">
              {isPurge ? <Ban size={22} /> : confirm.action === 'archive' ? <Trash2 size={22} /> : <RotateCcw size={22} />}
            </span>
            <h3 id="tb-confirm-title">{confirmTitle}</h3>
            <div id="tb-confirm-text" className="tb-confirm-text">
              {confirm.items.length === 1 ? (
                <div className="tb-confirm-item">
                  <strong>{confirm.items[0].productName}</strong>
                  <span className="tb-confirm-item-type">{confirm.items[0].type}</span>
                  <span className="sc-confirm-detail">{detailsText(confirm.items[0])}</span>
                </div>
              ) : (
                <ul className="tb-confirm-list">
                  {confirm.items.slice(0, 6).map((item) => <li key={keyOf(item)}>{item.productName} <small>({item.type})</small></li>)}
                  {confirm.items.length > 6 && <li>…and {confirm.items.length - 6} more</li>}
                </ul>
              )}
              {confirm.action === 'restore' && confirm.items.some((item) => item.kind === 'product') && (
                <p className="tb-confirm-note">Products come back with the stock entries deleted with them (and their supplier, if it was deleted too).</p>
              )}
              {confirm.action === 'archive' && <p className="tb-confirm-note">Archived records are removed from active system queries and can be restored later.</p>}
              {isPurge && <p className="tb-purge-effects">This permanently removes archived records. Historical sales and stock history are retained where they are linked to a product.</p>}
            </div>
            {isPurge && <p className="tb-confirm-final">This action can’t be undone.</p>}
            <PageToast message={error} type="error" />
            <div className="sc-modal-actions">
              <button type="button" className="sc-modal-cancel-btn" onClick={closeConfirm} disabled={busy} autoFocus={isPurge}>Cancel</button>
              {confirm.action === 'restore' ? (
                <button type="button" className="sc-modal-save-btn" onClick={runConfirmed} disabled={busy}>
                  {busy ? 'Restoring…' : 'Restore'}
                </button>
              ) : confirm.action === 'archive' ? (
                <button type="button" className="sc-modal-save-btn" onClick={runConfirmed} disabled={busy}>
                  {busy ? 'Archiving…' : 'Move to Archive'}
                </button>
              ) : (
                <button type="button" className="sc-modal-save-btn sc-confirm-danger-btn" onClick={runConfirmed} disabled={busy}>
                  {busy ? 'Deleting…' : 'Delete permanently'}
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
