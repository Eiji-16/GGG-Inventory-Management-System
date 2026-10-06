import React, { useState, useEffect, useMemo } from 'react';
import { Download, Search } from 'lucide-react';
import './reports.css';

/* ===== REPORT TABS ===== */
const TABS = [
  'Stock Summary',
  'Stock Movement',
  'Top Moving Products',
  'Demand Forecast Summary',
  'AutoCalculator Summary',
  'Inventory Aging Report',
  'Reorder Point Report',
];

const peso = (v) => `₱${Number(v || 0).toLocaleString('en-PH', { maximumFractionDigits: 0 })}`;

/* Status/urgency/confidence → badge class. */
const BADGE = {
  'In Stock': 'r-badge-good', Healthy: 'r-badge-good', High: 'r-badge-good',
  'Low Stock': 'r-badge-bad', Critical: 'r-badge-bad', Low: 'r-badge-warn',
  'Out of Stock': 'r-badge-bad', 'Slow Mover': 'r-badge-bad',
  Aging: 'r-badge-warn', Watch: 'r-badge-warn', Medium: 'r-badge-warn', Unknown: 'r-badge-warn',
};
const Badge = ({ label }) => (
  <span className={`r-badge ${BADGE[label] || 'r-badge-warn'}`}><span className="r-dot" />{label}</span>
);

/* ===== EXPORT CSV (reads the rendered table) ===== */
const exportPanelCsv = (btn, title) => {
  const panel = btn.closest('.r-panel-header')?.parentElement;
  const table = panel?.querySelector('.r-table');
  if (!table) return;
  const escape = (val) => `"${String(val ?? '').replace(/"/g, '""')}"`;
  const rows = Array.from(table.querySelectorAll('tr')).map((tr) =>
    Array.from(tr.querySelectorAll('th,td'))
      .map((cell) => escape(cell.innerText.trim()))
      .join(',')
  );
  const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${title.toLowerCase().replace(/\s+/g, '-')}-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
};

const PanelHeader = ({ title, subtitle }) => (
  <div className="r-panel-header">
    <div className="r-panel-title">
      <h2>{title}</h2>
      <p>{subtitle}</p>
    </div>
    <button className="r-export-btn" type="button" onClick={(e) => exportPanelCsv(e.currentTarget, title)}>
      <Download size={13} /> Export
    </button>
  </div>
);

/* Shared empty/loading row. */
const EmptyRow = ({ cols, text }) => (
  <tr><td colSpan={cols} style={{ textAlign: 'center', padding: '18px', color: 'var(--text-muted, #888)' }}>{text}</td></tr>
);

function StockSummaryTab({ data, loading }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const kpis = data?.kpis || {};
  const rows = data?.rows || [];

  const categories = useMemo(
    () => [...new Set(rows.map((r) => r.category).filter((c) => c && c !== '—'))],
    [rows]
  );
  const filtered = rows.filter((r) =>
    (!category || r.category === category) &&
    (!query || r.product.toLowerCase().includes(query.toLowerCase()))
  );

  return (
    <div>
      <PanelHeader title="Stock Summary" subtitle="Overview of current inventory levels across all products" />

      <div className="r-filters-bar">
        <div className="r-filter-field">
          <label>Category</label>
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All categories</option>
            {categories.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div className="r-filter-field" style={{ flex: 1, minWidth: 200 }}>
          <label>Search</label>
          <div style={{ position: 'relative' }}>
            <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted, #888)' }} />
            <input type="text" placeholder="Search product…" value={query} onChange={(e) => setQuery(e.target.value)} style={{ paddingLeft: 28, width: '100%' }} />
          </div>
        </div>
      </div>

      <div className="r-kpi-row">
        <div className="r-kpi-card">
          <div className="r-kpi-label">Total Stock</div>
          <div className="r-kpi-value">{Number(kpis.totalStock || 0).toLocaleString()}</div>
          <div className="r-kpi-sub">units across {kpis.productCount || 0} products</div>
        </div>
        <div className="r-kpi-card">
          <div className="r-kpi-label">Low Stock Items</div>
          <div className="r-kpi-value">{kpis.lowStock || 0}</div>
          <div className="r-kpi-sub">below reorder point</div>
        </div>
        <div className="r-kpi-card">
          <div className="r-kpi-label">Out of Stock</div>
          <div className="r-kpi-value">{kpis.outOfStock || 0}</div>
          <div className="r-kpi-sub">products depleted</div>
        </div>
        <div className="r-kpi-card">
          <div className="r-kpi-label">Inventory Value</div>
          <div className="r-kpi-value">{peso(kpis.inventoryValue)}</div>
          <div className="r-kpi-sub">at cost</div>
        </div>
      </div>

      <div className="r-table-card">
        <table className="r-table">
          <thead>
            <tr><th>Product</th><th>Category</th><th>Stock</th><th>Status</th></tr>
          </thead>
          <tbody>
            {loading ? <EmptyRow cols={4} text="Loading…" />
              : filtered.length === 0 ? <EmptyRow cols={4} text="No products found." />
              : filtered.map((r, i) => (
                <tr key={i}>
                  <td>{r.product}</td><td>{r.category}</td><td>{r.stock}</td>
                  <td><Badge label={r.status} /></td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StockMovementTab({ data, loading }) {
  const [chartType, setChartType] = useState('bar');
  const rows = data?.rows || [];
  const maxVal = Math.max(1, ...rows.map((r) => Math.max(r.in, r.out)));

  return (
    <div>
      <PanelHeader title="Stock Movement" subtitle="Units moving in and out of inventory over time" />

      <div className="r-chart-card">
        <div className="r-chart-card-head">
          <h3>Movement over time</h3>
          <div className="r-toggle-group">
            <button className={chartType === 'bar' ? 'active' : ''} onClick={() => setChartType('bar')}>Bar</button>
            <button className={chartType === 'line' ? 'active' : ''} onClick={() => setChartType('line')}>Line</button>
          </div>
        </div>
        {rows.length === 0 ? (
          <div className="r-chart-placeholder">{loading ? 'Loading…' : 'No movement data yet.'}</div>
        ) : (
          <div className="r-mini-chart">
            {rows.map((r, i) => (
              <div className="r-mini-col" key={i} title={`${r.period}: +${r.in} / -${r.out}`}>
                <div className="r-mini-bars">
                  <span className="r-mini-bar r-mini-in" style={{ height: `${(r.in / maxVal) * 100}%` }} />
                  <span className="r-mini-bar r-mini-out" style={{ height: `${(r.out / maxVal) * 100}%` }} />
                </div>
                <span className="r-mini-label">{r.period}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="r-table-card">
        <table className="r-table">
          <thead>
            <tr><th>Period</th><th>Stock In</th><th>Stock Out</th><th>Net Change</th></tr>
          </thead>
          <tbody>
            {loading ? <EmptyRow cols={4} text="Loading…" />
              : rows.length === 0 ? <EmptyRow cols={4} text="No movements recorded yet." />
              : rows.map((r, i) => (
                <tr key={i}>
                  <td>{r.period}</td><td>{r.in}</td><td>{r.out}</td>
                  <td className={r.net >= 0 ? 'r-trend-up' : 'r-trend-down'}>{r.net >= 0 ? '+' : ''}{r.net}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TopMovingProductsTab({ data, loading }) {
  const rows = data?.rows || [];
  return (
    <div>
      <PanelHeader title="Top Moving Products" subtitle="Ranked by units sold (stock out)" />
      <div className="r-table-card">
        <table className="r-table">
          <thead>
            <tr><th>Rank</th><th>Product</th><th>Units Sold</th><th>Value Moved</th></tr>
          </thead>
          <tbody>
            {loading ? <EmptyRow cols={4} text="Loading…" />
              : rows.length === 0 ? <EmptyRow cols={4} text="No sales/stock-out recorded yet." />
              : rows.map((r) => (
                <tr key={r.rank}>
                  <td>{r.rank}</td><td>{r.product}</td><td>{r.unitsSold}</td><td>{peso(r.value)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DemandForecastSummaryTab({ data, loading }) {
  const rows = data?.rows || [];
  return (
    <div>
      <PanelHeader title="Demand Forecast Summary" subtitle="Average demand from recorded sales history" />
      <div className="r-table-card">
        <table className="r-table">
          <thead>
            <tr><th>Product</th><th>Current Stock</th><th>Forecasted Demand</th><th>Suggested Reorder</th><th>Confidence</th></tr>
          </thead>
          <tbody>
            {loading ? <EmptyRow cols={5} text="Loading…" />
              : rows.length === 0 ? <EmptyRow cols={5} text="No sales history yet — record sales in Forecasting." />
              : rows.map((r, i) => (
                <tr key={i}>
                  <td>{r.product}</td><td>{r.currentStock}</td><td>{r.forecastedDemand}</td>
                  <td>{r.suggestedReorder}</td><td><Badge label={r.confidence} /></td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AutoCalculatorSummaryTab({ data, loading }) {
  const rows = data?.rows || [];
  return (
    <div>
      <PanelHeader title="AutoCalculator Summary" subtitle="Every AutoCalculator computation logged to date" />
      <div className="r-table-card">
        <table className="r-table">
          <thead>
            <tr><th>Formula</th><th>Result</th><th>Detail</th><th>Date Computed</th></tr>
          </thead>
          <tbody>
            {loading ? <EmptyRow cols={4} text="Loading…" />
              : rows.length === 0 ? <EmptyRow cols={4} text="No computations logged yet — use the Auto Calculator." />
              : rows.map((r, i) => (
                <tr key={i}>
                  <td>{r.formula}</td><td>{r.result ?? '—'}</td><td>{r.detail}</td><td>{r.date}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function InventoryAgingReportTab({ data, loading }) {
  const rows = data?.rows || [];
  return (
    <div>
      <PanelHeader title="Inventory Aging Report" subtitle="Days since the last stock-in for each product" />
      <div className="r-table-card">
        <table className="r-table">
          <thead>
            <tr><th>Product</th><th>Days in Stock</th><th>Stock Level</th><th>Status</th></tr>
          </thead>
          <tbody>
            {loading ? <EmptyRow cols={4} text="Loading…" />
              : rows.length === 0 ? <EmptyRow cols={4} text="No stock on hand to age." />
              : rows.map((r, i) => (
                <tr key={i}>
                  <td>{r.product}</td><td>{r.daysInStock ?? '—'}</td><td>{r.stock}</td>
                  <td><Badge label={r.status} /></td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ReorderPointReportTab({ data, loading }) {
  const rows = data?.rows || [];
  return (
    <div>
      <PanelHeader title="Reorder Point Report" subtitle="Products currently at or below their reorder point" />
      <div className="r-table-card">
        <table className="r-table">
          <thead>
            <tr><th>Product</th><th>Current Stock</th><th>Reorder Point</th><th>Urgency</th></tr>
          </thead>
          <tbody>
            {loading ? <EmptyRow cols={4} text="Loading…" />
              : rows.length === 0 ? <EmptyRow cols={4} text="All products are above their reorder point. 🎉" />
              : rows.map((r, i) => (
                <tr key={i}>
                  <td>{r.product}</td><td>{r.currentStock}</td><td>{r.reorderPoint}</td>
                  <td><Badge label={r.urgency} /></td>
                </tr>
              ))}
          </tbody>
        </table>
        <div className="r-supplier-note">
          Reorder point uses each product's safety stock (set by Super Admin), or 20 units by default.
        </div>
      </div>
    </div>
  );
}

/* ===== TAB VIEWS ===== */
const TAB_RENDER = [
  (p) => <StockSummaryTab {...p} data={p.report?.stockSummary} />,
  (p) => <StockMovementTab {...p} data={p.report?.stockMovement} />,
  (p) => <TopMovingProductsTab {...p} data={p.report?.topMoving} />,
  (p) => <DemandForecastSummaryTab {...p} data={p.report?.demandForecast} />,
  (p) => <AutoCalculatorSummaryTab {...p} data={p.report?.autoCalculator} />,
  (p) => <InventoryAgingReportTab {...p} data={p.report?.inventoryAging} />,
  (p) => <ReorderPointReportTab {...p} data={p.report?.reorderPoint} />,
];

export default function ReportsAnalyticsDesign() {
  const [activeTab, setActiveTab] = useState(0);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/reports', { headers: { Accept: 'application/json' } })
      .then((r) => { if (!r.ok) throw new Error(`Could not load reports (${r.status}).`); return r.json(); })
      .then((data) => setReport(data))
      .catch((e) => setError(e.message || 'Could not load reports.'))
      .finally(() => setLoading(false));
  }, []);

  const renderTab = TAB_RENDER[activeTab];

  return (
    <div className="r-root">
      <div className="r-tabbar">
        {TABS.map((label, i) => (
          <button
            key={label}
            className={`r-tab ${activeTab === i ? 'active' : ''}`}
            onClick={() => setActiveTab(i)}
          >
            {label}
          </button>
        ))}
      </div>

      {error
        ? <p className="r-supplier-note" role="alert" style={{ margin: 16 }}>{error}</p>
        : renderTab({ report, loading })}
    </div>
  );
}
