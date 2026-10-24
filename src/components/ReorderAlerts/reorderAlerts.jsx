import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Calculator, PackageCheck, Search } from 'lucide-react';
import './reorderAlerts.css';
import { reorderPointFor, SAFETY_STOCK_DEFAULTS } from '../../data/safetyStock';
import { buildForecastHandoff } from '../../utils/forecastHandoff';

/* ===== AUTO REORDER ALERTS (Figure 9) =====
   Lists every product whose stock is at or below its reorder point.
   Reorder point = safety stock + (annual demand ÷ 365 × lead time). */
export default function ReorderAlerts({ onNavigate, safetyStock = SAFETY_STOCK_DEFAULTS, catalogRevision = 0, canComputeEoq = true }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [orderingId, setOrderingId] = useState(null);

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

  const alerts = useMemo(() => products
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
      return { ...product, stock, reorderPoint, status: stock <= 0 ? 'Out of Stock' : 'Low Stock' };
    })
    .filter((product) => product.stock <= product.reorderPoint)
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
      || (statusFilter === 'low' && item.status === 'Low Stock');
    return matchesQuery && matchesStatus;
  });

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
      <div className="ra-kpis">
        <div className="ra-kpi">
          <span className="ra-kpi-label">Items needing reorder</span>
          <strong>{loading ? '—' : alerts.length}</strong>
        </div>
        <div className="ra-kpi ra-kpi-out">
          <span className="ra-kpi-label">Out of stock</span>
          <strong>{loading ? '—' : outCount}</strong>
        </div>
        <div className="ra-kpi ra-kpi-low">
          <span className="ra-kpi-label">Low stock</span>
          <strong>{loading ? '—' : lowCount}</strong>
        </div>
      </div>

      <div className="ra-card">
        <div className="ra-card-head">
          <div>
            <h2>Auto Reorder Alerts</h2>
            <p>Products that have reached their reorder point (safety stock + demand during lead time) and need restocking.</p>
          </div>
          <div className="ra-tools">
            <div className="ra-search">
              <Search size={13} aria-hidden="true" />
              <input
                type="search"
                placeholder="Search alerts…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search reorder alerts"
              />
            </div>
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
          </div>
        </div>

        {error && <p className="ra-error" role="alert">{error}</p>}

        <div className="ra-table-scroll">
          <table className="ra-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Category</th>
                <th>Supplier</th>
                <th>Current Stock</th>
                <th>Reorder Point</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="ra-empty">Checking stock levels…</td></tr>
              ) : visible.length === 0 ? (
                <tr>
                  <td colSpan={7} className="ra-empty">
                    {alerts.length === 0 ? (
                      <span className="ra-all-good"><PackageCheck size={18} /> All products are above their reorder point.</span>
                    ) : 'No alerts match your search.'}
                  </td>
                </tr>
              ) : visible.map((item) => (
                <tr key={item.id}>
                  <td data-label="Product">
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
                  <td data-label="Status">
                    <span className={`ra-status ${item.status === 'Out of Stock' ? 'is-out' : 'is-low'}`}>
                      <AlertTriangle size={11} aria-hidden="true" /> {item.status}
                    </span>
                  </td>
                  <td data-label="Action">
                    {canComputeEoq ? (
                      <button type="button" className={`ra-order-btn ${item.status === 'Out of Stock' ? 'is-urgent' : ''}`} onClick={() => orderNow(item)} disabled={orderingId !== null}>
                        <Calculator size={13} aria-hidden="true" /> {orderingId === item.id ? 'Loading forecast…' : 'Order Now'}
                      </button>
                    ) : <span className="ra-muted">Notify the owner</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="ra-help">“Order Now” opens the EOQ Calculator with this product’s forecast annual demand (next month’s WMA forecast, seasonal adjustment included, × 12). If there isn’t enough sales history to forecast yet, it uses the last 12 months of actual sales instead.</p>
      </div>
    </div>
  );
}
