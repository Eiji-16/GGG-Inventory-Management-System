import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, BellRing, Calculator, Check, ClipboardList, PackageCheck, PackageX, Search, ShoppingCart } from 'lucide-react';
import apiFetch from '../../apiFetch';
import './reorderAlerts.css';
import { reorderPointFor, safetyPointFor, statusPointsFor, SAFETY_STOCK_DEFAULTS } from '../../data/safetyStock';
import { buildForecastHandoff } from '../../utils/forecastHandoff';
import BulkOrder from './bulkOrder';
import MobileSelectBar from '../MobileSelectBar/MobileSelectBar';
import SearchSuggestions from '../SearchSuggestions/SearchSuggestions';

/* ===== REORDER LIST (Figure 9, formerly "Auto Reorder Alerts") =====
   Lists every product whose stock is at or below its reorder point.
   Reorder point = safety stock + (annual demand ÷ 365 × lead time). */
/* canNotify / canManageRequests come from Role Access ("Send restock
   requests" / "See and close restock requests"); the server checks the same
   boxes. onRequestsChanged lets the bell refresh right away. */
export default function ReorderAlerts({
  onNavigate,
  safetyStock = SAFETY_STOCK_DEFAULTS,
  catalogRevision = 0,
  canComputeEoq = true,
  canNotify = false,
  canManageRequests = false,
  onRequestsChanged,
}) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [orderingId, setOrderingId] = useState(null);
  // Bulk order: products ticked in the table, and the open Bulk Order window.
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkItems, setBulkItems] = useState(null);

  /* ===== RESTOCK REQUESTS (Staff "Notify") ===== */
  const [requests, setRequests] = useState([]);          // open requests
  const [notifyTarget, setNotifyTarget] = useState(null); // product being notified
  const [notifyNote, setNotifyNote] = useState('');
  const [notifyBusy, setNotifyBusy] = useState(false);
  const [notifyError, setNotifyError] = useState('');
  const [notice, setNotice] = useState('');
  const showRequests = canNotify || canManageRequests;

  const loadRequests = async () => {
    if (!showRequests) return;
    try {
      const response = await fetch('/api/restock-requests', { headers: { Accept: 'application/json' }, cache: 'no-store' });
      if (!response.ok) return;
      const data = await response.json();
      setRequests(Array.isArray(data) ? data : []);
    } catch {
      /* keep the last list */
    }
  };

  useEffect(() => {
    loadRequests();
    if (!showRequests) return undefined;
    const timer = window.setInterval(loadRequests, 30000);   // same rhythm as the bell
    return () => window.clearInterval(timer);
  }, [showRequests, catalogRevision]); // loadRequests only reads current props/state

  const requestByProduct = useMemo(
    () => Object.fromEntries(requests.map((request) => [request.productId, request])),
    [requests],
  );

  const openNotify = (item) => {
    setNotifyTarget(item);
    setNotifyNote('');
    setNotifyError('');
  };

  const sendNotify = async (event) => {
    event.preventDefault();
    if (!notifyTarget) return;
    setNotifyBusy(true);
    setNotifyError('');
    try {
      const response = await apiFetch('/api/restock-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: notifyTarget.id, note: notifyNote.trim() || null }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(Object.values(body?.errors || {}).flat()[0] || body?.message || `Could not send (${response.status}).`);
      setNotice(body.alreadyOpen
        ? `${notifyTarget.name} was already requested — the note was updated.`
        : `Sent. Admins will see the request for ${notifyTarget.name} in their notifications.`);
      setNotifyTarget(null);
      await loadRequests();
      onRequestsChanged?.();
    } catch (error) {
      setNotifyError(error.message || 'Could not send the request.');
    } finally {
      setNotifyBusy(false);
    }
  };

  const markDone = async (request) => {
    try {
      const response = await apiFetch(`/api/restock-requests/${request.id}/done`, { method: 'PUT' });
      if (!response.ok) throw new Error(`Could not close the request (${response.status}).`);
      setNotice(`Marked the request for ${request.productName} as done.`);
      await loadRequests();
      onRequestsChanged?.();
    } catch (error) {
      setNotice(error.message || 'Could not close the request.');
    }
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    fetch('/api/products', { headers: { Accept: 'application/json' }, cache: 'no-store' })
      .then((response) => {
        if (!response.ok) throw new Error(`Could not load products (${response.status}).`);
        return response.json();
      })
      .then((data) => { if (active) setProducts(Array.isArray(data) ? data : []); })
      .catch((loadError) => { if (active) setError(loadError.message || 'Could not load products.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [catalogRevision]);

  // Only products that already have a stock entry ("tracked") can be alerts —
  // the same rule as the Dashboard card, the bell and the sidebar badge.
  // Brand-new products with no entries yet are left out.
  const alerts = useMemo(() => products
    .filter((product) => product.inStockControl !== false)
    .map((product) => {
      const stock = Number(product.stock) || 0;
      const reorderPoint = reorderPointFor({
        productId: product.id,
        productName: product.name,
        safetyStock: product.safetyStock,
        annualDemand: product.annualDemand,
        demandFromHistory: product.demandFromHistory,
        leadTimeDays: product.leadTimeDays,
      }, safetyStock);
      const row = { productId: product.id, productName: product.name, safetyStock: product.safetyStock, annualDemand: product.annualDemand, demandFromHistory: product.demandFromHistory, leadTimeDays: product.leadTimeDays };
      const safety = safetyPointFor(row, safetyStock);
      const points = statusPointsFor(row, safetyStock);
      // This tab shows only two statuses: Out of Stock (0) and Low Stock
      // (at or below the low point, Automatic or Manual). Critical is still
      // used on the other pages.
      const status = stock <= 0 ? 'Out of Stock' : 'Low Stock';
      return { ...product, stock, reorderPoint, safety, points, status };
    })
    .filter((product) => product.stock <= product.points.low)
    .sort((a, b) => (a.stock - a.reorderPoint) - (b.stock - b.reorderPoint)),
  [products, safetyStock]);

  const outCount = alerts.filter((item) => item.status === 'Out of Stock').length;
  const lowCount = alerts.length - outCount;

  const visible = alerts.filter((item) => {
    const q = query.trim().toLowerCase();
    const matchesQuery = !q || [item.name, item.id, item.category, item.supplierName, ...(item.variants || [])]
      .some((value) => String(value || '').toLowerCase().includes(q));
    const matchesStatus = statusFilter === 'all'
      || (statusFilter === 'out' && item.status === 'Out of Stock')
      || (statusFilter === 'low' && item.status !== 'Out of Stock');
    return matchesQuery && matchesStatus;
  });

  /* ===== BULK ORDER SELECTION ===== */
  // Ticks on products that are no longer alerts are ignored.
  const selectedAlerts = alerts.filter((item) => selectedIds.has(item.id));
  const allVisibleSelected = visible.length > 0 && visible.every((item) => selectedIds.has(item.id));
  const toggleSelect = (id) => setSelectedIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleSelectAll = () => setSelectedIds((prev) => {
    const next = new Set(prev);
    visible.forEach((item) => (allVisibleSelected ? next.delete(item.id) : next.add(item.id)));
    return next;
  });
  const columnCount = canComputeEoq ? 8 : 7;

  /* Order Now sends the product's forecast demand (WMA + seasonal, per month
     × 12) to the EOQ Calculator. If no forecast is possible yet, it falls back
     to actual sales and the calculator says so. */
  const orderNow = async (item) => {
    setOrderingId(item.id);
    const { handoff, reason } = await buildForecastHandoff(item.id, item.name);
    setOrderingId(null);
    onNavigate?.('Auto-Calculator', handoff || {
      product: item.name,
      productId: item.id,
      annualDemand: item.annualDemand || item.demandFromHistory,
      forecastUnavailable: reason,
    });
  };

  return (
    <div className="ra-root">
      {/* Same card style as the Dashboard KPI row: icon + label + number. */}
      <div className="ra-kpis">
        <div className="ra-kpi">
          <span className="ra-kpi-icon" aria-hidden="true"><ClipboardList size={17} strokeWidth={1.8} /></span>
          <span className="ra-kpi-copy">
            <span className="ra-kpi-label">Items needing reorder</span>
            <strong>{loading ? '—' : alerts.length}</strong>
          </span>
        </div>
        <div className="ra-kpi ra-kpi-out">
          <span className="ra-kpi-icon" aria-hidden="true"><PackageX size={17} strokeWidth={1.8} /></span>
          <span className="ra-kpi-copy">
            <span className="ra-kpi-label">Out of stock</span>
            <strong>{loading ? '—' : outCount}</strong>
          </span>
        </div>
        <div className="ra-kpi ra-kpi-low">
          <span className="ra-kpi-icon" aria-hidden="true"><AlertTriangle size={17} strokeWidth={1.8} /></span>
          <span className="ra-kpi-copy">
            <span className="ra-kpi-label">Low stock</span>
            <strong>{loading ? '—' : lowCount}</strong>
          </span>
        </div>
      </div>

      <div className="ra-card">
        <div className="ra-card-head">
          <div>
            <h2>Reorder List</h2>
            <p>Products that have reached their reorder point (safety stock + demand during lead time) and need restocking.</p>
          </div>
          <div className="ra-tools">
            {/* Preset searches: the categories of the products in this list. */}
            <SearchSuggestions
              query={query}
              suggestions={alerts.map((item) => item.category)}
              onPick={setQuery}
              label="Categories"
            >
              <div className="ra-search">
                <Search size={13} aria-hidden="true" />
                <input
                  type="search"
                  placeholder="Search the list…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  aria-label="Search the reorder list"
                />
              </div>
            </SearchSuggestions>
            <div className="ra-filter" role="tablist" aria-label="Filter by status">
              {[['all', 'All'], ['out', 'Out of stock'], ['low', 'Low stock']].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={statusFilter === value}
                  className={statusFilter === value ? 'is-active' : ''}
                  onClick={() => setStatusFilter(value)}
                >
                  {label}
                </button>
              ))}
            </div>
            {canComputeEoq && (
              <button
                type="button"
                className={`ra-order-btn is-urgent ra-bulk-btn${selectedAlerts.length ? ' is-ready' : ''}`}
                onClick={() => setBulkItems(selectedAlerts)}
                disabled={selectedAlerts.length === 0}
                title={selectedAlerts.length ? 'Work out the order quantity for every ticked product' : 'Tick products in the table first'}
              >
                <ShoppingCart size={13} aria-hidden="true" className="ra-bulk-cart" /> Bulk order
                {/* key = count, so the number "pops" each time a product is ticked */}
                {selectedAlerts.length > 0 && (
                  <span key={selectedAlerts.length} className="ra-bulk-count" aria-label={`${selectedAlerts.length} selected`}>
                    {selectedAlerts.length}
                  </span>
                )}
              </button>
            )}
          </div>
        </div>

        {error && <p className="ra-error" role="alert">{error}</p>}
        {notice && (
          <p className="ra-notice" role="status">
            {notice}
            <button type="button" onClick={() => setNotice('')} aria-label="Dismiss message">×</button>
          </p>
        )}

        {canComputeEoq && (
          <MobileSelectBar
            total={visible.length}
            count={selectedAlerts.length}
            allSelected={allVisibleSelected}
            onToggleAll={toggleSelectAll}
            onClear={() => setSelectedIds(new Set())}
          />
        )}
        <div className="ra-table-scroll">
          <table className="ra-table m-folders">
            <thead>
              <tr>
                {canComputeEoq && (
                  <th className="ra-check">
                    <input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAll} aria-label="Select all alerts for bulk order" />
                  </th>
                )}
                <th className="ra-left">Product</th>
                <th className="ra-left">Category</th>
                <th className="ra-left">Supplier</th>
                <th>Current Stock</th>
                <th>Reorder Point</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={columnCount} className="ra-empty">Checking stock levels…</td></tr>
              ) : visible.length === 0 ? (
                <tr>
                  <td colSpan={columnCount} className="ra-empty">
                    {alerts.length === 0 ? (
                      <span className="ra-all-good"><PackageCheck size={18} /> All products are above their reorder point.</span>
                    ) : 'No products match your search.'}
                  </td>
                </tr>
              ) : visible.map((item) => (
                <tr key={item.id} className={selectedIds.has(item.id) ? 'is-selected' : ''}>
                  {canComputeEoq && (
                    <td className="ra-check m-keep" data-label="Bulk order">
                      <input type="checkbox" checked={selectedIds.has(item.id)} onChange={() => toggleSelect(item.id)} aria-label={`Select ${item.name} for bulk order`} />
                    </td>
                  )}
                  <td className="m-title" data-label="Product">
                    <span className="ra-product">
                      <strong>{item.name}</strong>
                      <small>{[item.id, ...(item.variants || []).slice(0, 3)].join(' · ')}</small>
                    </span>
                  </td>
                  <td data-label="Category">{item.category || '—'}</td>
                  <td data-label="Supplier">
                    {item.supplierName ? (
                      <span className="ra-product">
                        <span>{item.supplierName}</span>
                        {item.leadTimeDays != null && item.leadTimeDays !== '' && <small>{item.leadTimeDays}-day lead time</small>}
                      </span>
                    ) : '—'}
                  </td>
                  <td data-label="Current Stock" className="ra-num">{item.stock}</td>
                  <td data-label="Reorder Point" className="ra-num">{item.reorderPoint}</td>
                  <td className="m-peek" data-label="Status">
                    <span className="ra-status-cell">
                      <span className={`ra-status ${item.status === 'Out of Stock' ? 'is-out' : 'is-low'}`} title={`Low at ${item.points.low}${item.points.mode === 'manual' ? ' (set manually)' : ''} · safety stock ${item.safety}`}>
                        <AlertTriangle size={11} aria-hidden="true" /> {item.status}
                      </span>
                      {requestByProduct[item.id] && (
                        <small className="ra-request-info">
                          <BellRing size={10} aria-hidden="true" /> Requested by {requestByProduct[item.id].requestedBy}
                          {requestByProduct[item.id].note ? `: “${requestByProduct[item.id].note}”` : ''}
                        </small>
                      )}
                    </span>
                  </td>
                  <td data-label="Action">
                    <span className="ra-actions">
                      {canComputeEoq && (
                        <button type="button" className={`ra-order-btn ${item.status !== 'Low Stock' ? 'is-urgent' : ''}`} onClick={() => orderNow(item)} disabled={orderingId !== null}>
                          <Calculator size={13} aria-hidden="true" /> {orderingId === item.id ? 'Loading forecast…' : 'Order Now'}
                        </button>
                      )}
                      {canManageRequests && requestByProduct[item.id] && (
                        <button type="button" className="ra-order-btn" onClick={() => markDone(requestByProduct[item.id])} title="Close this restock request">
                          <Check size={13} aria-hidden="true" /> Mark done
                        </button>
                      )}
                      {canNotify && !canManageRequests && (requestByProduct[item.id] ? (
                        <span className="ra-notified"><Check size={12} aria-hidden="true" /> Notified</span>
                      ) : (
                        <button type="button" className="ra-order-btn" onClick={() => openNotify(item)}>
                          <BellRing size={13} aria-hidden="true" /> Notify
                        </button>
                      ))}
                      {!canComputeEoq && !canNotify && !canManageRequests && <span className="ra-muted">—</span>}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {notifyTarget && createPortal(
          <div className="ra-modal-overlay" onClick={() => !notifyBusy && setNotifyTarget(null)}>
            <form className="ra-modal" onClick={(event) => event.stopPropagation()} onSubmit={sendNotify} role="dialog" aria-modal="true" aria-labelledby="ra-notify-title">
              <h3 id="ra-notify-title">Notify about {notifyTarget.name}</h3>
              <p className="ra-modal-sub">Admins will see this in their notifications. {notifyTarget.stock} on hand · {notifyTarget.status}.</p>
              <label htmlFor="ra-notify-note">Note (optional)</label>
              <textarea
                id="ra-notify-note"
                rows={3}
                maxLength={255}
                value={notifyNote}
                onChange={(event) => setNotifyNote(event.target.value)}
                placeholder="e.g. Customer asking for size L"
                autoFocus
              />
              {notifyError && <p className="ra-error" role="alert">{notifyError}</p>}
              <div className="ra-modal-actions">
                <button type="button" className="ra-order-btn" onClick={() => setNotifyTarget(null)} disabled={notifyBusy}>Cancel</button>
                <button type="submit" className="ra-order-btn is-urgent" disabled={notifyBusy}>{notifyBusy ? 'Sending…' : 'Send'}</button>
              </div>
            </form>
          </div>,
          document.body,
        )}
        {bulkItems && (
          <BulkOrder
            items={bulkItems}
            onClose={() => setBulkItems(null)}
            onSaved={() => setSelectedIds(new Set())}
          />
        )}
        <p className="ra-help">Tick several products and press “Bulk order” to work out all their order quantities at once (same method as “Order Now”, for each product).</p>
        <p className="ra-help">“Order Now” opens the Economic Order Quantity Calculator with this product’s forecast annual demand (next month’s weighted moving average forecast, seasonal adjustment included, × 12). If there isn’t enough sales history to forecast yet, it uses the last 12 months of actual sales instead.</p>
      </div>
    </div>
  );
}
