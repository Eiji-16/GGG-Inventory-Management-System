import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, RotateCcw, Trash2, AlertTriangle, Package, X } from 'lucide-react';

/* Reuses Stock Control's table, button and popup styles so the page looks the same. */
import '../StockControl/stockControl.css';
import './trashBin.css';
import apiFetch from '../../apiFetch';
import SearchSuggestions from '../SearchSuggestions/SearchSuggestions';
import { useCurrency } from '../../CurrencyContext';

/* ===== TRASH BIN =====
   Deleted products and stock entries land here instead of being erased.
   Each item shows what it was, who deleted it and when. Allowed users can
   Restore it (it comes back exactly as it was) or Permanently delete it
   (erased for good). Role Access decides who sees which button; the
   server checks the same boxes. */

const formatWhen = (iso) => {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });
};

const firstError = (result, fallback) => (
  result?.errors ? Object.values(result.errors).flat()[0] : result?.message
) || fallback;

function TrashBin({
  isActive = false,
  refreshKey = 0,
  onRestored,
  canRestore = false,
  canPurge = false,
}) {
  const { formatCurrency } = useCurrency();
  const [records, setRecords] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, perPage: 50, lastPage: 1, total: 0 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [busyKey, setBusyKey] = useState(null);   // item being restored / deleted
  const [confirm, setConfirm] = useState(null);   // { action: 'restore' | 'purge', kind, item }
  const [currentPassword, setCurrentPassword] = useState('');
  const requestRef = useRef(0);

  const load = async (requestedPage = page, requestedQuery = query) => {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(requestedPage),
        per_page: String(pagination.perPage),
        search: requestedQuery.trim(),
      });
      const response = await fetch(`/api/trash?${params}`, { cache: 'no-store', headers: { Accept: 'application/json' } });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(firstError(result, `Could not load the Trash Bin (${response.status}).`));
      if (requestId === requestRef.current) {
        setRecords(Array.isArray(result.records) ? result.records : []);
        setPagination(result.pagination || { page: requestedPage, perPage: 50, lastPage: 1, total: 0 });
        setPage(result.pagination?.page || requestedPage);
        setError('');
      }
    } catch (loadError) {
      if (requestId === requestRef.current) setError(loadError.message || 'Could not load the Trash Bin.');
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  };

  // Search and pagination are applied by the shared Trash Bin endpoint.
  useEffect(() => {
    if (!isActive) return undefined;
    const timeout = window.setTimeout(() => load(page, query), 200);
    return () => window.clearTimeout(timeout);
  }, [isActive, refreshKey, page, query]);

  const run = async (key, url, method, successText, body = null) => {
    setBusyKey(key);
    try {
      const response = await apiFetch(url, {
        method,
        headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(firstError(result, `That didn't work (${response.status}).`));
      setError('');
      setNotice(successText(result));
      await load(page, query);
      onRestored?.();   // other pages (Stock Control, Products, Dashboard) reload their numbers
      return true;
    } catch (actionError) {
      setNotice('');
      setError(actionError.message || "That didn't work.");
      return false;
    } finally {
      setBusyKey(null);
    }
  };

  const restoreProduct = (product) => run(
    `p-${product.id}`,
    `/api/trash/products/${encodeURIComponent(product.id)}/restore`,
    'POST',
    (result) => `${product.productName} was restored${result.restoredEntries ? ` with ${result.restoredEntries} stock entr${result.restoredEntries === 1 ? 'y' : 'ies'}` : ''}.`,
  );

  const restoreEntry = (entry) => run(
    `m-${entry.id}`,
    `/api/trash/stock-movements/${entry.id}/restore`,
    'POST',
    () => `${entry.details.movementType} ${entry.details.quantity >= 0 ? '+' : '−'}${Math.abs(entry.details.quantity)} for ${entry.productName} was restored and its stock updated.`,
  );

  const confirmPurge = async () => {
    if (!confirm) return;
    const { kind, item } = confirm;
    let succeeded;
    if (kind === 'product') {
      succeeded = await run(`p-${item.id}`, `/api/trash/products/${encodeURIComponent(item.id)}`, 'DELETE',
        () => `${item.productName} was permanently deleted.`,
        { current_password: currentPassword });
    } else {
      succeeded = await run(`m-${item.id}`, `/api/trash/stock-movements/${item.id}`, 'DELETE',
        () => `The ${item.details.movementType.toLowerCase()} entry for ${item.productName} was permanently deleted.`,
        { current_password: currentPassword });
    }
    if (succeeded) {
      setConfirm(null);
      setCurrentPassword('');
    } else {
      setCurrentPassword('');
    }
  };

  const recordKey = (item) => `${item.kind === 'product' ? 'p' : 'm'}-${item.id}`;
  const restoreRecord = (item) => item.kind === 'product' ? restoreProduct(item) : restoreEntry(item);
  const closeConfirmation = () => {
    if (busyKey) return;
    setConfirm(null);
    setCurrentPassword('');
  };
  const confirmRestore = async () => {
    if (!confirm) return;
    await restoreRecord(confirm.item);
    setConfirm(null);
  };
  const detailsText = (item) => {
    if (item.kind === 'product') {
      return [
        item.category ? `Category: ${item.category}` : null,
        item.details.brand ? `Brand: ${item.details.brand}` : null,
        `Stock on hand: ${item.details.stockOnHand}`,
      ].filter(Boolean).join(' · ');
    }

    return [
      item.details.movementType,
      `Qty ${item.details.quantity >= 0 ? '+' : '−'}${Math.abs(item.details.quantity)}`,
      item.details.unitPrice != null ? `Price ${formatCurrency(item.details.unitPrice)}` : null,
      `Recorded by: ${item.details.recordedBy || '—'}`,
      `Recorded: ${item.details.movementDate || '—'}`,
      item.details.notes || null,
    ].filter(Boolean).join(' · ');
  };

  return (
    <div className="sc-table-parent tb-page">
      <div className="sc-navigation-bar">
        <div className="sc-search-wrapper">
          <SearchSuggestions
            query={query}
            suggestions={records.map((item) => item.category)}
            onPick={(value) => { setPage(1); setQuery(value); }}
            label="Categories"
          >
            <div className="sc-search-box">
              <Search size={13} className="sc-search-icon" />
              <input type="search" placeholder="Search the Trash Bin…" value={query} onChange={(e) => { setPage(1); setQuery(e.target.value); }} aria-label="Search the Trash Bin" />
            </div>
          </SearchSuggestions>
        </div>
      </div>

      <p className="tb-hint">
        {pagination.total} deleted {pagination.total === 1 ? 'record' : 'records'}. Items here are left out of active stock totals, reports and forecasts.
      </p>

      {error && (
        <div className="sc-error-banner" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => load(page, query)}>Retry</button>
        </div>
      )}
      {notice && (
        <div className="sc-merge-notice" role="status">
          <span>{notice}</span>
          <button type="button" className="sc-safety-alert-close" onClick={() => setNotice('')} aria-label="Dismiss"><X size={14} /></button>
        </div>
      )}

      <div className="sc-table-scroll">
        <table className="sc-table m-folders tb-unified-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Type</th>
              <th className="sc-th-left">Product</th>
              <th>SKU / Product ID</th>
              <th>Variant</th>
              <th className="sc-th-left">Details</th>
              <th>Deleted By</th>
              <th>Deleted On</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="sc-empty-state">Loading the Trash Bin…</td></tr>
            ) : records.length === 0 ? (
              <tr><td colSpan={9} className="sc-empty-state">{query ? 'No trashed records match your search.' : 'The Trash Bin is empty.'}</td></tr>
            ) : records.map((item) => {
              const busy = busyKey === recordKey(item);
              const cannotRestoreEntry = item.kind === 'entry' && (item.productInTrash || item.productMissing);
              return (
                <tr key={recordKey(item)}>
                  <td className="sc-td-nowrap" data-label="Date">{item.date}</td>
                  <td data-label="Type"><span className={`tb-type tb-type-${item.kind}`}>{item.type}</span></td>
                  <td className="sc-td-left m-title" data-label="Product">
                    <span className="sc-name-cell">
                      {item.kind === 'product' && <span className="sc-thumb sc-thumb-empty" aria-hidden="true"><Package size={12} /></span>}
                      <span>
                        {item.productName}
                        {item.kind === 'entry' && item.productInTrash && <small className="sc-deleted-tag" title="Restore the product first to bring this stock entry back."> (product in Trash Bin)</small>}
                        {item.kind === 'entry' && item.productMissing && <small className="sc-deleted-tag"> (product permanently deleted)</small>}
                      </span>
                    </span>
                  </td>
                  <td className="sc-td-nowrap" data-label="SKU / Product ID">{item.productId || '—'}</td>
                  <td data-label="Variant">{item.variantName || '—'}</td>
                  <td className="sc-td-left tb-details" data-label="Details" title={item.kind === 'entry' ? item.details.notes || '' : ''}>{detailsText(item)}</td>
                  <td className="sc-td-nowrap" data-label="Deleted By">{item.deletedBy || '—'}</td>
                  <td className="sc-td-nowrap" data-label="Deleted On">{formatWhen(item.deletedAt)}</td>
                  <td className="sc-td-actions" data-label="Actions">
                    <div className="sc-action-cell-container">
                      {canRestore && (
                        <button
                          type="button"
                          className="sc-table-action-btn sc-history-btn"
                          onClick={() => { setError(''); setConfirm({ action: 'restore', kind: item.kind, item }); }}
                          disabled={busy || cannotRestoreEntry}
                          title={item.kind === 'product'
                            ? 'Restore this product and the stock entries deleted with it'
                            : cannotRestoreEntry
                              ? (item.productInTrash ? 'Restore the product first' : 'The product no longer exists')
                              : 'Restore this stock entry and update stock'}
                          aria-label={`Restore ${item.kind === 'product' ? item.productName : `${item.productName} stock entry`}`}
                        >
                          <RotateCcw size={14} />
                        </button>
                      )}
                      {canPurge && (
                        <button type="button" className="sc-table-action-btn sc-delete-btn" onClick={() => { setError(''); setCurrentPassword(''); setConfirm({ action: 'purge', kind: item.kind, item }); }} disabled={busy}
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

      {confirm && createPortal(
        <div className="sc-modal-overlay sc-confirm-overlay" onClick={closeConfirmation}>
          <div className={`sc-modal sc-confirm-modal${confirm.action === 'purge' ? ' tb-purge-modal' : ''}`} onClick={(e) => e.stopPropagation()} role="alertdialog" aria-modal="true" aria-labelledby="tb-confirm-title" aria-describedby="tb-confirm-text">
            <span className={`sc-confirm-icon ${confirm.action === 'purge' ? 'is-out' : 'is-safe'}`} aria-hidden="true">
              {confirm.action === 'purge' ? <AlertTriangle size={22} /> : <RotateCcw size={22} />}
            </span>
            <h3 id="tb-confirm-title">{confirm.action === 'purge' ? 'Delete permanently?' : 'Restore this record?'}</h3>
            <p id="tb-confirm-text">
              {confirm.action === 'restore' ? (
                <>
                  Restore <strong>{confirm.item.productName}</strong>
                  {confirm.kind === 'entry' ? (
                    <> — {confirm.item.details.movementType}, quantity {confirm.item.details.quantity >= 0 ? '+' : '−'}{Math.abs(confirm.item.details.quantity)}.</>
                  ) : (
                    <> and the stock entries deleted with it.</>
                  )}
                  {confirm.kind === 'entry' && confirm.item.productInTrash && ' The product must be restored first.'}
                </>
              ) : confirm.kind === 'product' ? (
                <>
                  <strong>{confirm.item.productName}</strong> and its product-specific settings and restock requests will be erased for good. Historical stock entries and sales are retained as audit records, but can no longer be restored or used by active product features.
                </>
              ) : (
                <>
                  This stock entry will be erased for good. The stock total does not change (it was already taken out when the entry was deleted).
                  <span className="sc-confirm-detail">
                    {confirm.item.productName} · {confirm.item.details.movementType} <strong>{confirm.item.details.quantity >= 0 ? '+' : '−'}{Math.abs(confirm.item.details.quantity)}</strong> · {confirm.item.date}
                  </span>
                </>
              )}
              {confirm.action === 'purge' && <span className="sc-confirm-detail">This can’t be undone. Enter your current password to confirm.</span>}
            </p>
            {confirm.action === 'purge' && (
              <label className="tb-password-field">
                Current password
                <input
                  type="password"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  aria-label="Current password to confirm permanent deletion"
                  required
                />
              </label>
            )}
            {error && <p className="tb-confirm-error" role="alert">{error}</p>}
            <div className="sc-modal-actions">
              <button type="button" className="sc-modal-cancel-btn" onClick={closeConfirmation} disabled={Boolean(busyKey)} autoFocus>Cancel</button>
              {confirm.action === 'restore' ? (
                <button type="button" className="sc-modal-save-btn" onClick={confirmRestore} disabled={Boolean(busyKey)}>
                  Restore
                </button>
              ) : (
                <button type="button" className="sc-modal-save-btn sc-confirm-danger-btn" onClick={confirmPurge} disabled={!currentPassword || Boolean(busyKey)}>
                  Delete permanently
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
