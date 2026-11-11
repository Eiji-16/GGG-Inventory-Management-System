import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import MarqueeText from '../../utils/marqueeText';
import { createPortal } from 'react-dom';
import { AlertTriangle, BellRing, Calculator, Check, ClipboardList, FileText, PackageCheck, PackageX, Search, X } from 'lucide-react';
import apiFetch from '../../apiFetch';
import { PageToast } from '../../utils/toast';
import './reorderAlerts.css';
import { reorderPointFor, safetyPointFor, statusPointsFor, SAFETY_STOCK_DEFAULTS } from '../../data/safetyStock';
import { buildForecastHandoff } from '../../utils/forecastHandoff';
import BulkOrder from './bulkOrder';
import ReceiveDelivery from './ReceiveDelivery';
import MobileSelectBar from '../MobileSelectBar/MobileSelectBar';
import SearchSuggestions from '../SearchSuggestions/SearchSuggestions';

/* ===== REORDER LIST (Figure 9, formerly "Auto Reorder Alerts") =====
   Lists every product whose stock is at or below its reorder point.
   Reorder point = safety stock + (annual demand ÷ 365 × lead time). */
/* canNotify / canManageRequests come from Role Access ("Send restock
   requests" / "See and close restock requests"); the server checks the same
   boxes. onRequestsChanged lets the bell refresh right away. */
/* ===== STAFF REQUEST NOTE ICON (2026-11-11) =====
   A small bell icon beside the status badge. Hover it (or tap / Tab to it)
   to see who requested the restock and their note (every Staff member who
   requested it, with a number on the bell when there is more than one), in a pop-up on top of
   the page, so the long note no longer fills the Status column. */
function RequestNoteTip({ requests }) {
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState(null);
  const iconRef = useRef(null);
  const tipRef = useRef(null);

  useLayoutEffect(() => {
    if (!open) return undefined;
    const update = () => {
      const icon = iconRef.current;
      const tip = tipRef.current;
      if (!icon || !tip) return;
      const zoom = parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
      const rect = icon.getBoundingClientRect();
      const width = tip.offsetWidth * zoom;
      const height = tip.offsetHeight * zoom;
      const gap = 8 * zoom;
      let top = rect.top - gap - height;              // above the icon
      if (top < 8) top = rect.bottom + gap;            // no room: below it
      const left = Math.max(8, Math.min(rect.left + rect.width / 2 - width / 2, window.innerWidth - width - 8));
      setPlace({ top: top / zoom, left: left / zoom });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open]);

  const label = requests
    .map((request) => `Requested by ${request.requestedBy}${request.note ? `: “${request.note}”` : ''}`)
    .join('. ');
  return (
    <>
      <button
        ref={iconRef}
        type="button"
        className={`ra-request-icon${open ? ' is-open' : ''}`}
        aria-label={label}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(event) => { if (event.key === 'Escape') setOpen(false); }}
      >
        <BellRing size={12} aria-hidden="true" />
        {requests.length > 1 && <span className="ra-request-count">{requests.length}</span>}
      </button>
      {open && createPortal(
        <div
          ref={tipRef}
          className="ra-request-tip"
          role="tooltip"
          style={place ? { top: place.top, left: place.left } : { visibility: 'hidden' }}
        >
          {requests.map((request) => (
            <span key={request.id} className="ra-request-tip-item">
              <span className="ra-request-tip-title">
                <BellRing size={11} aria-hidden="true" /> Requested by {request.requestedBy}
              </span>
              {request.note
                ? <span className="ra-request-tip-note">“{request.note}”</span>
                : <span className="ra-request-tip-empty">No note</span>}
            </span>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}

export default function ReorderAlerts({
  onNavigate,
  safetyStock = SAFETY_STOCK_DEFAULTS,
  catalogRevision = 0,
  canComputeEoq = true,
  canNotify = false,
  canManageRequests = false,
  canOpenCalculator = canComputeEoq,
  canReceive = false,
  onRequestsChanged,
  onStockChanged,
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
  // "Mark as received": the product whose delivery is being recorded.
  const [receiveItem, setReceiveItem] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

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

  /* 2026-11-11: each Staff member can request the same product, so a
     product can have several open requests: { "P-001": [request, …] }. */
  const requestsByProduct = useMemo(
    () => requests.reduce((map, request) => {
      (map[request.productId] ||= []).push(request);
      return map;
    }, {}),
    [requests],
  );

  /* ===== WAITING FOR DELIVERY (2026-11-06) =====
     A product that is in a saved Restock Report is being handled: the row
     says "In Restock Report, waiting for delivery" and Staff do not see the
     Request button again. The saved quantity is cleared when the delivery
     is recorded (Received or a Stock In), so the label goes away by itself.
     { "P-001": { qty, suggested, savedAt, savedBy } } */
  const [savedReports, setSavedReports] = useState({});
  const loadSavedReports = async () => {
    try {
      const response = await fetch('/api/restock-report', { headers: { Accept: 'application/json' }, cache: 'no-store' });
      if (!response.ok) return;
      const data = await response.json();
      setSavedReports(data && typeof data === 'object' && !Array.isArray(data) ? data : {});
    } catch {
      /* keep the last list */
    }
  };
  useEffect(() => {
    loadSavedReports();
    const timer = window.setInterval(loadSavedReports, 30000);   // same rhythm as the requests
    return () => window.clearInterval(timer);
  }, [catalogRevision, reloadKey]); // loadSavedReports only reads current props/state
  const reportDate = (saved) => (saved?.savedAt
    ? new Date(`${saved.savedAt}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
    : '');

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
        : `Request sent. Admins will get an email${body.emailed === 0 ? ' (if the system email is working)' : ''} and see ${notifyTarget.name} in their notifications.`);
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
      setNotice(`Closed the request for ${request.productName}.`);
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
  }, [catalogRevision, reloadKey]);

  /* A delivery was recorded as a Stock In: show a message, reload the list
     (the product drops off once it is above its low-stock level) and tell
     the rest of the app that stock changed. */
  const handleReceived = ({ id, name, qty, merged, hasProof }) => {
    setReceiveItem(null);
    const proof = hasProof ? ' with a proof photo' : '';
    setNotice(merged
      ? `Accomplished: ${qty} × ${name} received${proof}. It was added to today's Stock In entry in Stock Control.`
      : `Accomplished: ${qty} × ${name} received${proof}. A Stock In was recorded in Stock Control.`);
    setSelectedIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
    // The app-wide refresh also reloads this list; reload here only when
    // this page is used on its own.
    if (onStockChanged) onStockChanged(); else setReloadKey((key) => key + 1);
  };

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
  /* Restock Report (was "Bulk order"): 1 or more ticked products. */
  const BULK_MIN = 1;
  const canBulk = selectedAlerts.length >= BULK_MIN;
  const bulkHint = selectedAlerts.length === 0
    ? 'Tick the products to restock in the table first'
    : 'Work out the restock quantity for every ticked product and export the report';

  /* Calculate Now (was "Order Now") sends the product's forecast demand (WMA + seasonal, per month
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
            <strong><MarqueeText>{loading ? '—' : Number(alerts.length).toLocaleString()}</MarqueeText></strong>
          </span>
        </div>
        <div className="ra-kpi ra-kpi-out">
          <span className="ra-kpi-icon" aria-hidden="true"><PackageX size={17} strokeWidth={1.8} /></span>
          <span className="ra-kpi-copy">
            <span className="ra-kpi-label">Out of stock</span>
            <strong><MarqueeText>{loading ? '—' : Number(outCount).toLocaleString()}</MarqueeText></strong>
          </span>
        </div>
        <div className="ra-kpi ra-kpi-low">
          <span className="ra-kpi-icon" aria-hidden="true"><AlertTriangle size={17} strokeWidth={1.8} /></span>
          <span className="ra-kpi-copy">
            <span className="ra-kpi-label">Low stock</span>
            <strong><MarqueeText>{loading ? '—' : Number(lowCount).toLocaleString()}</MarqueeText></strong>
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
            {/* Filter buttons first, then the search bar (one toolbar row). */}
            <div className="ra-filter" role="tablist" aria-label="Filter by status">
              {[['all', 'All', 'All'], ['out', 'Out of stock', 'Out'], ['low', 'Low stock', 'Low']].map(([value, label, short]) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={statusFilter === value}
                  className={statusFilter === value ? 'is-active' : ''}
                  onClick={() => setStatusFilter(value)}
                >
                  <span className="ra-label-long">{label}</span>
                  <span className="ra-label-short" aria-hidden="true">{short}</span>
                </button>
              ))}
            </div>
            {/* Preset searches: the categories of the products in this list. */}
            <SearchSuggestions
              recentKey="reorder"
              query={query}
              suggestions={alerts.map((item) => item.category)}
              onPick={setQuery}
              label="Categories"
            >
              <div className="ra-search xs-search">
                <Search size={13} aria-hidden="true" />
                <input
                  autoComplete="off"
                  type="search"
                  placeholder="Search the list…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  aria-label="Search the reorder list"
                />
              </div>
            </SearchSuggestions>
            {canComputeEoq && (
              <button
                type="button"
                className={`ra-order-btn is-urgent ra-bulk-btn${canBulk ? ' is-ready' : ''}`}
                onClick={() => { if (canBulk) setBulkItems(selectedAlerts); }}
                disabled={!canBulk}
                title={bulkHint}
              >
                <FileText size={13} aria-hidden="true" className="ra-bulk-cart" /> <span className="ra-bulk-label">Restock Report</span>
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
        {/* Page messages show as a bottom-right pop-up (2026-11-06). */}
        <PageToast message={notice} type="info" onShown={() => setNotice('')} />

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
                    <input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAll} aria-label="Select all products for the restock report" />
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
                    <td className="ra-check m-keep" data-label="Restock Report">
                      <input type="checkbox" checked={selectedIds.has(item.id)} onChange={() => toggleSelect(item.id)} aria-label={`Select ${item.name} for the restock report`} />
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
                      <span className="ra-status-row">
                        <span className={`ra-status ${item.status === 'Out of Stock' ? 'is-out' : 'is-low'}`} title={`Low at ${item.points.low}${item.points.mode === 'manual' ? ' (set manually)' : ''} · safety stock ${item.safety}`}>
                          <AlertTriangle size={11} aria-hidden="true" /> {item.status}
                        </span>
                        {requestsByProduct[item.id] && (
                          <RequestNoteTip requests={requestsByProduct[item.id]} />
                        )}
                      </span>
                      {savedReports[item.id] && (
                        <small className="ra-report-info" title={`Owner's quantity ${savedReports[item.id].qty}${savedReports[item.id].savedBy ? ` · saved by ${savedReports[item.id].savedBy}` : ''}`}>
                          <FileText size={10} aria-hidden="true" /> In Restock Report{reportDate(savedReports[item.id]) ? ` (${reportDate(savedReports[item.id])})` : ''}, waiting for delivery
                        </small>
                      )}
                    </span>
                  </td>
                  <td data-label="Action">
                    <span className="ra-actions">
                      {canOpenCalculator && (
                        <button type="button" className={`ra-order-btn ${item.status !== 'Low Stock' ? 'is-urgent' : ''}`} onClick={() => orderNow(item)} disabled={orderingId !== null} aria-label={`Calculate Now: ${item.name}`} title="Calculate Now: work out the Economic Order Quantity">
                          <Calculator size={13} aria-hidden="true" /> <span className="ra-btn-label">{orderingId === item.id ? 'Loading forecast…' : 'Calculate Now'}</span>
                        </button>
                      )}
                      {canReceive && (
                        <button type="button" className="ra-order-btn ra-receive-btn ra-icon-btn" onClick={() => setReceiveItem(item)} aria-label={`Received: ${item.name}`} title="Received — the delivery arrived: add a proof photo and record it as a Stock In">
                          <PackageCheck size={15} aria-hidden="true" />
                        </button>
                      )}
                      {/* Last slot keeps the same width in every row (2026-11-11), so the
                          buttons before it line up from row to row. */}
                      {canManageRequests && (
                        <span className="ra-action-slot is-close">
                          {requestsByProduct[item.id] && (
                            <button type="button" className="ra-order-btn ra-icon-btn ra-close-btn" onClick={() => markDone(requestsByProduct[item.id][0])} aria-label={`Close request: ${item.name}`} title="Close request — closes the request(s) for this product without a delivery (for example, the product will not be restocked). A delivery recorded with Received closes them by itself.">
                              <X size={15} aria-hidden="true" />
                            </button>
                          )}
                        </span>
                      )}
                      {canNotify && !canManageRequests && (
                        <span className="ra-action-slot is-request">
                          {requestsByProduct[item.id]?.some((request) => request.mine) ? (
                            <span className="ra-notified"><Check size={12} aria-hidden="true" /> Requested</span>
                          ) : savedReports[item.id] ? (
                            <span className="ra-notified ra-waiting" title="This product is in a saved Restock Report. The label goes away when the delivery is recorded."><FileText size={12} aria-hidden="true" /> Waiting for delivery</span>
                          ) : (
                            <button type="button" className="ra-order-btn" onClick={() => openNotify(item)} aria-label={`Request restock: ${item.name}`} title="Ask the Admins to restock this product (email + notification)">
                              <BellRing size={13} aria-hidden="true" /> <span className="ra-btn-label">Request</span>
                            </button>
                          )}
                        </span>
                      )}
                      {!canOpenCalculator && !canNotify && !canManageRequests && !canReceive && <span className="ra-muted">—</span>}
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
              <h3 id="ra-notify-title">Request restock: {notifyTarget.name}</h3>
              <p className="ra-modal-sub">Admins and the Super Admin get an email and see it in their notifications. {notifyTarget.stock} on hand · {notifyTarget.status}.</p>
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
              <PageToast message={notifyError} type="error" onShown={() => setNotifyError('')} />
              <div className="ra-modal-actions">
                <button type="button" className="ra-order-btn" onClick={() => setNotifyTarget(null)} disabled={notifyBusy}>Cancel</button>
                <button type="submit" className="ra-order-btn is-urgent" disabled={notifyBusy}>{notifyBusy ? 'Sending…' : 'Send request'}</button>
              </div>
            </form>
          </div>,
          document.body,
        )}
        {receiveItem && (
          <ReceiveDelivery
            item={receiveItem}
            onClose={() => setReceiveItem(null)}
            onReceived={handleReceived}
          />
        )}
        {bulkItems && (
          <BulkOrder
            items={bulkItems}
            onClose={() => setBulkItems(null)}
            onSaved={() => { setSelectedIds(new Set()); loadSavedReports(); }}
          />
        )}
      </div>
    </div>
  );
}
