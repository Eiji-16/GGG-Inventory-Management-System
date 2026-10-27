import React, { useEffect, useMemo, useState } from 'react';
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

const movementLabel = (type) => {
  if (type === 'Adjustment') return 'Correction';
  if (type === 'Stock Out') return 'Sold';
  return 'Added';
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
  const [tab, setTab] = useState('products'); // 'products' | 'entries'
  const [products, setProducts] = useState([]);
  const [movements, setMovements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [busyKey, setBusyKey] = useState(null);   // item being restored / deleted
  const [confirm, setConfirm] = useState(null);   // { kind: 'product' | 'entry', item }

  const load = async () => {
    try {
      const response = await fetch('/api/trash', { cache: 'no-store', headers: { Accept: 'application/json' } });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(firstError(result, `Could not load the Trash Bin (${response.status}).`));
      setProducts(Array.isArray(result.products) ? result.products : []);
      setMovements(Array.isArray(result.movements) ? result.movements : []);
      setError('');
    } catch (loadError) {
      setError(loadError.message || 'Could not load the Trash Bin.');
    } finally {
      setLoading(false);
    }
  };

  // Load when the page is opened, and again whenever something was deleted elsewhere.
  useEffect(() => { if (isActive) load(); }, [isActive, refreshKey]);

  const q = query.trim().toLowerCase();
  const visibleProducts = useMemo(() => products.filter((p) => !q
    || [p.id, p.name, p.category, p.brand, p.deletedBy].some((f) => String(f || '').toLowerCase().includes(q))), [products, q]);
  const visibleMovements = useMemo(() => movements.filter((m) => !q
    || [m.productName, m.category, m.variantName, m.notes, m.recordedBy, m.deletedBy, m.date, movementLabel(m.type)]
      .some((f) => String(f || '').toLowerCase().includes(q))), [movements, q]);

  const run = async (key, url, method, successText) => {
    setBusyKey(key);
    try {
      const response = await apiFetch(url, { method, headers: { Accept: 'application/json' } });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(firstError(result, `That didn't work (${response.status}).`));
      setError('');
      setNotice(successText(result));
      await load();
      onRestored?.();   // other pages (Stock Control, Products, Dashboard) reload their numbers
    } catch (actionError) {
      setNotice('');
      setError(actionError.message || "That didn't work.");
    } finally {
      setBusyKey(null);
    }
  };

  const restoreProduct = (product) => run(
    `p-${product.id}`,
    `/api/trash/products/${encodeURIComponent(product.id)}/restore`,
    'POST',
    (result) => `${product.name} was restored${result.restoredEntries ? ` with ${result.restoredEntries} stock entr${result.restoredEntries === 1 ? 'y' : 'ies'}` : ''}.`,
  );

  const restoreEntry = (entry) => run(
    `m-${entry.id}`,
    `/api/trash/stock-movements/${entry.id}/restore`,
    'POST',
    () => `${movementLabel(entry.type)} ${entry.change >= 0 ? '+' : '−'}${Math.abs(entry.change)} for ${entry.productName} was restored and its stock updated.`,
  );

  const confirmPurge = async () => {
    if (!confirm) return;
    const { kind, item } = confirm;
    setConfirm(null);
    if (kind === 'product') {
      await run(`p-${item.id}`, `/api/trash/products/${encodeURIComponent(item.id)}`, 'DELETE',
        () => `${item.name} was permanently deleted.`);
    } else {
      await run(`m-${item.id}`, `/api/trash/stock-movements/${item.id}`, 'DELETE',
        () => `The ${movementLabel(item.type).toLowerCase()} entry for ${item.productName} was permanently deleted.`);
    }
  };

  const deletedCell = (item) => (
    <>
      <td className="sc-td-nowrap" data-label="Deleted by">{item.deletedBy || '—'}</td>
      <td className="sc-td-nowrap" data-label="Deleted on">{formatWhen(item.deletedAt)}</td>
    </>
  );

  return (
    <div className="sc-table-parent tb-page">
      <div className="tb-tabs" role="tablist" aria-label="Trash Bin sections">
        <button type="button" role="tab" aria-selected={tab === 'products'} className={`tb-tab${tab === 'products' ? ' is-active' : ''}`} onClick={() => setTab('products')}>
          Products <span className="tb-count">{products.length}</span>
        </button>
        <button type="button" role="tab" aria-selected={tab === 'entries'} className={`tb-tab${tab === 'entries' ? ' is-active' : ''}`} onClick={() => setTab('entries')}>
          Stock entries <span className="tb-count">{movements.length}</span>
        </button>
      </div>

      <div className="sc-navigation-bar">
        <div className="sc-search-wrapper">
          {/* Preset searches: categories of the deleted items on the open tab. */}
          <SearchSuggestions
            query={query}
            suggestions={(tab === 'products' ? products : movements).map((item) => item.category)}
            onPick={setQuery}
            label="Categories"
          >
            <div className="sc-search-box">
              <Search size={13} className="sc-search-icon" />
              <input type="search" placeholder="Search the Trash Bin…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search the Trash Bin" />
            </div>
          </SearchSuggestions>
        </div>
      </div>

      <p className="tb-hint">
        Deleted items stay here until someone restores them or deletes them permanently. Items here are left out of stock totals, reports and forecasts.
      </p>

      {error && (
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

      <div className="sc-table-scroll">
        {tab === 'products' ? (
          <table className="sc-table m-folders">
            <thead>
              <tr>
                <th className="sc-th-left">Product</th>
                <th>Category</th>
                <th className="sc-th-quantity">QTY</th>
                <th title="Stock entries that went to the Trash Bin with this product">Entries</th>
                <th>Deleted by</th>
                <th>Deleted on</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="sc-empty-state">Loading the Trash Bin…</td></tr>
              ) : visibleProducts.length === 0 ? (
                <tr><td colSpan={7} className="sc-empty-state">{products.length ? 'No deleted products match your search.' : 'No deleted products.'}</td></tr>
              ) : visibleProducts.map((product) => {
                const busy = busyKey === `p-${product.id}`;
                return (
                  <tr key={product.id}>
                    <td className="sc-td-left m-title" data-label="Product">
                      <span className="sc-name-cell">
                        <span className="sc-thumb sc-thumb-empty" aria-hidden="true"><Package size={12} /></span>
                        <span>{product.name} <small className="tb-muted">{product.id}</small></span>
                      </span>
                    </td>
                    <td data-label="Category">{product.category || '—'}</td>
                    <td className="sc-td-strong" data-label="QTY">{product.stock}</td>
                    <td data-label="Entries">{product.entries}</td>
                    {deletedCell(product)}
                    <td className="sc-td-actions" data-label="Actions">
                      <div className="sc-action-cell-container">
                        {canRestore && (
                          <button type="button" className="sc-table-action-btn sc-history-btn" onClick={() => restoreProduct(product)} disabled={busy}
                            title="Restore this product and the stock entries deleted with it" aria-label={`Restore ${product.name}`}>
                            <RotateCcw size={14} />
                          </button>
                        )}
                        {canPurge && (
                          <button type="button" className="sc-table-action-btn sc-delete-btn" onClick={() => setConfirm({ kind: 'product', item: product })} disabled={busy}
                            title="Delete permanently" aria-label={`Permanently delete ${product.name}`}>
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
        ) : (
          <table className="sc-table m-folders">
            <thead>
              <tr>
                <th>Date</th>
                <th className="sc-th-left">Product</th>
                <th>Variant</th>
                <th>Type</th>
                <th className="sc-th-quantity">QTY</th>
                <th className="sc-th-quantity">Price</th>
                <th>Recorded by</th>
                <th>Deleted by</th>
                <th>Deleted on</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={10} className="sc-empty-state">Loading the Trash Bin…</td></tr>
              ) : visibleMovements.length === 0 ? (
                <tr><td colSpan={10} className="sc-empty-state">{movements.length ? 'No deleted entries match your search.' : 'No deleted stock entries.'}</td></tr>
              ) : visibleMovements.map((entry) => {
                const busy = busyKey === `m-${entry.id}`;
                const changeText = `${entry.change >= 0 ? '+' : '−'}${Math.abs(entry.change)}`;
                return (
                  <tr key={entry.id}>
                    <td className="sc-td-nowrap" data-label="Date">{entry.date}</td>
                    <td className="sc-td-left m-title" data-label="Product" title={entry.notes || ''}>
                      {entry.productName}
                      {entry.productInTrash && <small className="sc-deleted-tag" title="This product is in the Trash Bin too. Restore the product to bring this entry back."> (product in Trash Bin)</small>}
                    </td>
                    <td data-label="Variant">{entry.variantName || '—'}</td>
                    <td className="m-peek" data-label="Type">
                      <span className={`sc-type-pill sc-type-${(entry.type || '').replace(/\s+/g, '').toLowerCase()}`}>{movementLabel(entry.type)}</span>
                    </td>
                    <td className={`sc-td-strong ${entry.change >= 0 ? 'sc-in' : 'sc-out'}`} data-label="QTY">{changeText}</td>
                    <td className="sc-td-nowrap" data-label="Price">{entry.unitPrice != null ? formatCurrency(entry.unitPrice) : '—'}</td>
                    <td data-label="Recorded by">{entry.recordedBy || '—'}</td>
                    {deletedCell(entry)}
                    <td className="sc-td-actions" data-label="Actions">
                      <div className="sc-action-cell-container">
                        {canRestore && (
                          <button type="button" className="sc-table-action-btn sc-history-btn" onClick={() => restoreEntry(entry)}
                            disabled={busy || entry.productInTrash}
                            title={entry.productInTrash ? 'Restore the product first (Products tab)' : `Restore — puts ${changeText} back into the stock`}
                            aria-label={`Restore ${entry.productName} entry`}>
                            <RotateCcw size={14} />
                          </button>
                        )}
                        {canPurge && (
                          <button type="button" className="sc-table-action-btn sc-delete-btn" onClick={() => setConfirm({ kind: 'entry', item: entry })} disabled={busy}
                            title="Delete permanently" aria-label={`Permanently delete ${entry.productName} entry`}>
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
        )}
      </div>

      {confirm && createPortal(
        <div className="sc-modal-overlay sc-confirm-overlay" onClick={() => setConfirm(null)}>
          <div className="sc-modal sc-confirm-modal" onClick={(e) => e.stopPropagation()} role="alertdialog" aria-modal="true" aria-labelledby="tb-confirm-title" aria-describedby="tb-confirm-text">
            <span className="sc-confirm-icon is-out" aria-hidden="true"><AlertTriangle size={22} /></span>
            <h3 id="tb-confirm-title">Delete permanently?</h3>
            <p id="tb-confirm-text">
              {confirm.kind === 'product' ? (
                <>
                  <strong>{confirm.item.name}</strong> will be erased for good, together with all of its stock entries, safety stock setting, past sales and restock requests.
                </>
              ) : (
                <>
                  This stock entry will be erased for good. The stock total does not change (it was already taken out when the entry was deleted).
                  <span className="sc-confirm-detail">
                    {confirm.item.productName} · {movementLabel(confirm.item.type)} <strong>{confirm.item.change >= 0 ? '+' : '−'}{Math.abs(confirm.item.change)}</strong> · {confirm.item.date}
                  </span>
                </>
              )}
              <span className="sc-confirm-detail">This can’t be undone.</span>
            </p>
            <div className="sc-modal-actions">
              <button type="button" className="sc-modal-cancel-btn" onClick={() => setConfirm(null)} autoFocus>Cancel</button>
              <button type="button" className="sc-modal-save-btn sc-confirm-danger-btn" onClick={confirmPurge}>Delete permanently</button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

export default TrashBin;
