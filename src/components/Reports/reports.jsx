import { Fragment, useState, useEffect, useMemo } from 'react';
import { PageToast } from '../../utils/toast';
import { createPortal } from 'react-dom';
import {
  Download, FileText, X, ChevronRight, ChevronDown, Search, ArrowUpRight, Package, Wallet,
  ShoppingBag, TrendingUp, Calculator, Hourglass, FileSpreadsheet, ShieldCheck, ArrowUpDown,
} from 'lucide-react';
import './reports.css';
import exportReportWorkbook, { printReportPdf } from '../../utils/exportReportWorkbook';
import { useCurrency } from '../../CurrencyContext';
import useFillToBottom from '../../utils/fillToBottom';
import { CountUp, CountUpText } from '../../utils/countUp';
import MarqueeText from '../../utils/marqueeText';
import CustomSelect from '../Forecasting/CustomSelect';
import { usePagedRows, RowsFooter } from '../RowsPicker/RowsPicker';

/* ===== REPORTS & ANALYTICS: ONE OVERALL REPORT =====
   One page, no tabs. It shows the overall picture of the system's data:
     - 8 summary cards (two rows of four), and
     - 2 charts: weekly Stock In vs Stock Out, and fast vs slow moving products.
   Every card and chart can be clicked: it opens that specific report in a
   pop-up with all of its rows and its own Export PDF / Export Excel.
   "Export full report" puts every report into one file.
   Role Access (Settings) still decides which reports a role can see: the
   server leaves hidden ones out of /api/reports, so their cards don't show. */

/* Status/urgency/confidence → badge colour. */
const BADGE = {
  'In Stock': 'r-badge-good', Healthy: 'r-badge-good', High: 'r-badge-good',
  // 2026-11-18: two stock statuses: Low Stock (amber) and Out of Stock (red).
  'Low Stock': 'r-badge-warn', Critical: 'r-badge-bad', Low: 'r-badge-warn',
  'Out of Stock': 'r-badge-bad', 'Slow Mover': 'r-badge-bad',
  'Fast-Moving': 'r-badge-good', 'Slow-Moving': 'r-badge-bad',
  Aging: 'r-badge-warn', Watch: 'r-badge-warn', Medium: 'r-badge-warn', Unknown: 'r-badge-warn',
  'No Stock Records': 'r-badge-neutral',   // no Stock Control entries yet
};
/* Phone cards in the report pop-up (2026-11-16): shorter labels so they fit
   on one line, the status badge in the top-right corner, and Units Needed
   in bold gold when more than 0 (0 stays grey). Laptop tables and exports
   keep the full column names. */
const SHORT_LABEL = { 'Forecasted Demand': 'Forecast' };
/* ===== MAIN NUMBER OF EACH REPORT (2026-11-18) =====
   Shown in amber (like "Units Needed" on the Reorder List) so the value
   that matters most stands out in every row. */
const KEY_COLUMN = {
  stockSummary: (h) => h === 'Value',
  stockMovement: (h) => h === 'Net Change',
  topMoving: (h) => h === 'Units Sold',
  fastSlowMoving: (h) => h.startsWith('Units Sold'),
  autoCalculator: (h) => h === 'Result',
  inventoryAging: (h) => h === 'Days in Stock',
  reorderPoint: (h) => h.startsWith('Reorder Point'),
  categoryBreakdown: (h) => h === 'Inventory Value',
  stockHealth: (h) => h === 'Products',
};
const cellClass = (header, cell, index, sectionKey) => {
  if (index === 0) return 'r-cell-first';
  if (typeof cell === 'string' && BADGE[cell]) return 'r-cell-badge';
  if (header === 'Units Needed') return Number(cell) > 0 ? 'r-cell-need' : 'r-cell-zero';
  if (KEY_COLUMN[sectionKey]?.(header)) return 'r-cell-key';
  return '';
};

/* ===== SEARCH + SORT HELPERS (2026-11-18) =====
   cellText: what a cell holds as plain text (lists join their names).
   sortValue: numbers ("$1,234.50", "48 (est.)", "+12", "7%") sort as numbers,
   dates (2026-11-18) and words sort A–Z; a list sorts by how many it holds. */
const cellText = (cell) => (Array.isArray(cell) ? cell.join(' ') : String(cell ?? ''));
const sortValue = (cell) => {
  if (Array.isArray(cell)) return cell.length;
  if (typeof cell === 'number') return cell;
  const text = String(cell ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text;
  const match = text.match(/^[^\d\-−+]{0,3}([-−+]?[\d,]*\.?\d+)/);
  if (match) return Number(match[1].replace(/,/g, '').replace('−', '-'));
  return text.toLowerCase();
};
const isBlank = (value) => value === '' || value === '—';
const compareCells = (a, b, dir = 1) => {
  const av = sortValue(a);
  const bv = sortValue(b);
  if (isBlank(av) || isBlank(bv)) return isBlank(av) - isBlank(bv);   // "—" always last
  if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
  if (typeof av === 'number') return -1;   // numbers before words
  if (typeof bv === 'number') return 1;
  return String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: 'base' }) * dir;
};
const Badge = ({ label }) => (
  <span className={`r-badge ${BADGE[label] || 'r-badge-warn'}`}><span className="r-dot" />{label}</span>
);

/* Shared empty/loading row. */
const EmptyRow = ({ cols, text }) => (
  <tr><td colSpan={cols} style={{ textAlign: 'center', padding: '18px', color: 'var(--text-muted, #888)' }}>{text}</td></tr>
);

const sumBy = (rows, key) => rows.reduce((total, row) => total + (Number(row[key]) || 0), 0);

/* Hover data for one week (bar and line chart). */
const weekTip = (r) => `Week of ${r.period}\nStock In: +${Number(r.in).toLocaleString()}\nStock Out: −${Number(r.out).toLocaleString()}\nNet change: ${r.in - r.out >= 0 ? '+' : '−'}${Math.abs(r.in - r.out).toLocaleString()}`;

/* ===== CHART: weekly Stock In vs Stock Out (Bar / Line) ===== */
function MovementLineChart({ rows, maxVal }) {
  const width = 600;
  const height = 200;
  const pad = { top: 12, right: 12, bottom: 24, left: 12 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const x = (i) => pad.left + (rows.length === 1 ? innerW / 2 : (i / (rows.length - 1)) * innerW);
  const y = (v) => pad.top + innerH - (v / maxVal) * innerH;
  const path = (key) => rows.map((r, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(r[key]).toFixed(1)}`).join(' ');

  return (
    <svg className="r-line-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Weekly stock in and stock out line chart">
      <line x1={pad.left} x2={width - pad.right} y1={pad.top + innerH} y2={pad.top + innerH} className="r-line-axis" />
      <path d={path('in')} className="r-line r-line-in" pathLength="1" />
      <path d={path('out')} className="r-line r-line-out" pathLength="1" />
      {rows.map((r, i) => {
        // A full-height hover strip per week: shows that week's numbers.
        const step = rows.length > 1 ? innerW / (rows.length - 1) : innerW;
        return (
          <g key={r.weekStart || i} className="r-line-week">
            <rect
              className="r-line-hit"
              x={x(i) - step / 2}
              y={pad.top}
              width={step}
              height={innerH}
              data-tip={weekTip(r)}
            />
            <line className="r-line-guide" x1={x(i)} x2={x(i)} y1={pad.top} y2={pad.top + innerH} />
            <circle cx={x(i)} cy={y(r.in)} r="3.5" className="r-line-dot r-line-in" />
            <circle cx={x(i)} cy={y(r.out)} r="3.5" className="r-line-dot r-line-out" />
            <text x={x(i)} y={height - 6} textAnchor="middle" className="r-line-label">{r.period}</text>
          </g>
        );
      })}
    </svg>
  );
}

/* A card or chart that opens its report when clicked (or Enter / Space). */
const clickableProps = (onOpen, label) => (onOpen ? {
  role: 'button',
  tabIndex: 0,
  'aria-label': `Open ${label}`,
  onClick: onOpen,
  onKeyDown: (event) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen(); }
  },
} : {});

const OpenHint = () => (
  <span className="r-open-hint" aria-hidden="true">View report <ChevronRight size={12} /></span>
);

function MovementChartCard({ rows, loading, onOpen }) {
  const [chartType, setChartType] = useState('bar');
  const maxVal = Math.max(1, ...rows.map((r) => Math.max(r.in, r.out)));
  // The Bar / Line switch changes the chart only; it doesn't open the report.
  const pick = (type) => (event) => { event.stopPropagation(); setChartType(type); };
  return (
    <div className="r-chart-card r-overall-chart r-clickable r-feature-card" {...clickableProps(onOpen, 'Stock Movement report')}>
      <div className="r-chart-card-head">
        <h3>Stock In vs Stock Out — last {rows.length || 8} weeks</h3>
        <div className="r-chart-head-right">
          <div className="r-toggle-group">
            <button type="button" className={chartType === 'bar' ? 'active' : ''} onClick={pick('bar')}>Bar</button>
            <button type="button" className={chartType === 'line' ? 'active' : ''} onClick={pick('line')}>Line</button>
          </div>
          {onOpen && <OpenHint />}
        </div>
      </div>
      {rows.length === 0 ? (
        <div className={`r-chart-placeholder${loading ? ' ui-loading' : ''}`}>{loading ? 'Loading…' : 'No movement data yet.'}</div>
      ) : chartType === 'line' ? (
        <MovementLineChart key="line" rows={rows} maxVal={maxVal} />
      ) : (
        <div className="r-mini-chart" key="bar">
          {rows.map((r, i) => (
            <div className="r-mini-col" key={r.weekStart || i} data-tip={weekTip(r)}>
              <div className="r-mini-bars">
                <span className="r-mini-bar r-mini-in" style={{ height: `${(r.in / maxVal) * 100}%` }} />
                <span className="r-mini-bar r-mini-out" style={{ height: `${(r.out / maxVal) * 100}%` }} />
              </div>
              <span className="r-mini-label">{r.period}</span>
            </div>
          ))}
        </div>
      )}
      <div className="r-chart-legend">
        <span><i className="r-legend-swatch r-mini-in" /> Stock In</span>
        <span><i className="r-legend-swatch r-mini-out" /> Stock Out</span>
      </div>
    </div>
  );
}

/* ===== CHART: fast vs slow moving products (horizontal bars) ===== */
function MovementBars({ title, items, tone, emptyText, onOpen }) {
  const max = Math.max(1, ...items.map((item) => item.unitsSold));
  return (
    <div className="r-chart-card r-fs-card r-overall-chart r-clickable" {...clickableProps(onOpen, 'Fast & Slow Moving Products report')}>
      <div className="r-chart-card-head"><h3>{title}</h3>{onOpen && <OpenHint />}</div>
      {items.length === 0 ? (
        <div className="r-fs-empty">{emptyText}</div>
      ) : (
        <ul className="r-fs-list">
          {items.map((item) => (
            <li
              key={item.productId || item.product}
              className="r-fs-row"
              data-tip={`${item.product}\n${Number(item.unitsSold).toLocaleString()} units sold${item.category && item.category !== '—' ? `\n${item.category}` : ''}${item.stock != null ? `\n${Number(item.stock).toLocaleString()} in stock now` : ''}`}
            >
              <span className="r-fs-name">{item.product}</span>
              <span className="r-fs-track">
                <span className={`r-fs-bar r-fs-${tone}`} style={{ width: `${Math.max(2, (item.unitsSold / max) * 100)}%` }} />
              </span>
              <span className="r-fs-value">{item.unitsSold}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ===== CHART: products that need reordering (most urgent first) =====
   Each bar = current stock compared with the reorder point (full bar = at the
   reorder point). Colour follows the urgency: red = out of stock / critical,
   amber = low. Opens the Reorder Point Report. */
const URGENCY_ORDER = { 'Out of Stock': 0, 'Low Stock': 1 };
function ReorderBars({ rows, emptyText, onOpen }) {
  const items = [...rows]
    .sort((a, b) => (URGENCY_ORDER[a.urgency] ?? 3) - (URGENCY_ORDER[b.urgency] ?? 3)
      || (Number(a.currentStock) / Math.max(1, Number(a.reorderPoint))) - (Number(b.currentStock) / Math.max(1, Number(b.reorderPoint))))
    .slice(0, 6);   // 6 rows fill the card (was 5)
  return (
    <div className="r-chart-card r-fs-card r-overall-chart r-clickable" {...clickableProps(onOpen, 'Reorder Point Report')}>
      <div className="r-chart-card-head">
        <h3>Needs Reorder{rows.length ? ` (${rows.length})` : ''}</h3>
        {onOpen && <OpenHint />}
      </div>
      {items.length === 0 ? (
        <div className="r-fs-empty">{emptyText}</div>
      ) : (
        <ul className="r-fs-list">
          {items.map((item) => {
            const point = Math.max(1, Number(item.reorderPoint) || 0);
            const stock = Math.max(0, Number(item.currentStock) || 0);
            const tone = item.urgency === 'Low Stock' ? 'warn' : 'slow';
            return (
              <li
                key={item.productId || item.product}
                className="r-fs-row r-reorder-row"
                data-tip={`${item.product}\n${item.urgency}\n${stock} in stock · reorder point ${item.reorderPoint}${item.criticalPoint != null ? ` · safety stock level ${item.criticalPoint}` : ''}${Number(item.reorderPoint) - stock + 1 > 0 ? `\nNeeds ${Number(item.reorderPoint) - stock + 1} more to get back above the reorder point` : ''}`}
              >
                <span className="r-fs-name">{item.product}</span>
                <span className="r-fs-track">
                  <span className={`r-fs-bar r-fs-${tone}`} style={{ width: `${Math.max(2, Math.min(100, (stock / point) * 100))}%` }} />
                </span>
                <span className="r-fs-value r-reorder-value">{stock} / {item.reorderPoint}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ===== SECTIONS (the same rows go on screen and into the export) ===== */
function buildSections(report, formatCurrency) {
  const sections = [];
  const add = (key, title, note, headers, rows, emptyText) => sections.push({ key, title, note, headers, rows, emptyText });

  if (report?.stockSummary) {
    add('stockSummary', 'Stock Summary', 'Current stock level, value and status of every product. Value uses the latest Stock In price.',
      ['Product', 'Category', 'Stock', 'Unit Cost', 'Value', 'Status'],
      (report.stockSummary.rows || []).map((r) => [
        r.product, r.category, r.stock,
        r.unitCost != null ? formatCurrency(r.unitCost) : '—',
        r.value != null ? formatCurrency(r.value) : '—',
        r.status,
      ]), 'No products found.');
  }
  if (report?.stockMovement) {
    add('stockMovement', 'Stock Movement', 'Units in and out per week (last 8 weeks, Monday start). Corrections are not included.',
      ['Week of', 'Stock In', 'Stock Out', 'Net Change'],
      (report.stockMovement.rows || []).map((r) => [r.period, r.in, r.out, `${r.net >= 0 ? '+' : ''}${r.net}`]),
      'No movements recorded yet.');
  }
  if (report?.topMoving) {
    /* 2026-11-17: last 12 months, Stock Out + Past Sales (like the Dashboard).
       Sales with no saved price are valued at the product's latest price and
       "Price Used" says which, so a product with a price never shows $0. */
    const priceUsed = (r) => {
      if (r.value == null) return 'No price yet';
      if (!r.estimateFrom) return 'Saved on each sale';
      const label = r.estimateFrom === 'selling' ? 'Last selling price' : 'Stock In price';
      return r.recordedValue > 0
        ? `Saved price + ${label.toLowerCase()} ${formatCurrency(r.estimatePrice)} for ${Number(r.estimatedUnits).toLocaleString()} units`
        : `${label} ${formatCurrency(r.estimatePrice)}`;
    };
    add('topMoving', 'Top Moving Products',
      'Units sold in the last 12 months (Stock Out + Past Sales). Sales Value = units × the price saved on each sale; units with no saved price (and Past Sales) use the product\'s latest selling price, or its Stock In price if it was never sold with a price. "Price Used" shows which.',
      ['Rank', 'Product', 'Units Sold', 'Sales Value', 'Price Used'],
      (report.topMoving.rows || []).map((r) => [
        r.rank, `${r.product}${r.deleted ? ' (deleted)' : ''}`, r.unitsSold,
        r.value != null ? formatCurrency(r.value) : '—',
        priceUsed(r),
      ]),
      'No sales recorded in the last 12 months.');
  }
  if (report?.fastSlowMoving) {
    const days = report.fastSlowMoving.windowDays || 90;
    add('fastSlowMoving', 'Fast & Slow Moving Products', `Units sold (Stock Out + Past Sales) in the last ${days} days.`,
      ['Movement', 'Rank', 'Product', 'Category', `Units Sold (${days} days)`, 'Current Stock'],
      (report.fastSlowMoving.rows || []).map((r) => [r.movement, r.rank, r.product, r.category, r.unitsSold, r.stock]),
      'No products to rank yet.');
  }
  if (report?.demandForecast) {
    add('demandForecast', 'Demand Forecast Summary', "This month's forecast: 3-month Weighted Moving Average plus any active seasonal event. Units Needed = safety stock + sales during the lead time + this month's forecast − current stock (a guide; the Economic Order Quantity is in the calculator).",
      ['Product', 'Current Stock', 'Forecasted Demand', 'Units Needed', 'Confidence'],
      (report.demandForecast.rows || []).map((r) => [
        r.product, r.currentStock,
        `${r.forecastedDemand}${r.adjustmentPct ? ` (${r.adjustmentPct > 0 ? '+' : ''}${r.adjustmentPct}%)` : ''}`,
        r.suggestedReorder, r.confidence,
      ]), 'No completed month of sales yet — record Stock Out in Stock Control or add Past Sales in Forecasting.');
  }
  if (report?.autoCalculator) {
    const calcTotal = Number(report.autoCalculator.total ?? (report.autoCalculator.rows || []).length);
    const calcShown = (report.autoCalculator.rows || []).length;
    add('autoCalculator', 'Economic Order Quantity Calculator Summary',
      calcTotal > calcShown
        ? `The newest ${calcShown} of ${calcTotal.toLocaleString()} Economic Order Quantity calculations.`
        : 'Every Economic Order Quantity calculation logged to date.',
      ['Product', 'Product ID', 'Formula', 'Demand Source', 'Annual Demand', 'Result', 'Computed By', 'Date Computed'],
      (report.autoCalculator.rows || []).map((r) => [
        r.product || '—', r.productId || '—',
        r.formula === 'EOQ' ? 'Economic Order Quantity' : r.formula,
        r.demandSource === 'forecast' ? 'Forecast' : 'Historical',
        r.annualDemand != null ? `${Number(r.annualDemand).toLocaleString('en-PH')} units/year` : '—',
        r.result != null
          ? `${r.formula === 'EOQ'
            ? (r.recommendedOrderQuantity ?? Math.round(Number(r.result))).toLocaleString('en-PH')
            : r.result} ${r.unit || ''}`.trim()
          : '—',
        r.by || '—', r.date,
      ]), 'No calculations logged yet — use the Economic Order Quantity Calculator.');
  }
  if (report?.inventoryAging) {
    add('inventoryAging', 'Inventory Aging Report', 'Days since the latest Stock In (estimated from the creation date if there is none). Over 60 days = Aging, over 120 = Slow Mover.',
      ['Product', 'Days in Stock', 'Stock Level', 'Status'],
      (report.inventoryAging.rows || []).map((r) => [
        r.product,
        r.daysInStock == null ? '—' : `${r.daysInStock}${r.ageEstimated ? ' (est.)' : ''}`,
        r.stock, r.status,
      ]), 'No stock on hand to age.');
  }
  if (report?.reorderPoint) {
    add('reorderPoint', 'Reorder Point Report', 'Products at or below their reorder point (safety stock + daily sales × lead time).',
      ['Product', 'Current Stock', 'Reorder Point (Low at)', 'Safety Stock Level', 'Urgency'],
      (report.reorderPoint.rows || []).map((r) => [
        r.product, r.currentStock, `${r.reorderPoint}${r.mode === 'manual' ? ' (manual)' : r.mode === 'default' ? ' (default)' : ''}`, r.criticalPoint ?? '—', r.urgency,
      ]), 'All products are above their reorder point.');
  }
  /* Two extra views made from the Stock Summary rows, so every card on the
     page opens a different report. */
  if (report?.stockSummary) {
    const rows = report.stockSummary.rows || [];

    // Products by Category: one row per category.
    const byCategory = new Map();
    rows.forEach((r) => {
      const key = r.category && r.category !== '—' ? r.category : 'No category';
      const entry = byCategory.get(key) || { products: 0, units: 0, value: 0, unpriced: 0, attention: 0 };
      entry.products += 1;
      entry.units += Number(r.stock) || 0;
      if (r.value != null) entry.value += Number(r.value) || 0; else if (Number(r.stock) > 0) entry.unpriced += 1;
      if (['Low Stock', 'Out of Stock'].includes(r.status)) entry.attention += 1;
      byCategory.set(key, entry);
    });
    add('categoryBreakdown', 'Products by Category', 'How many products, units and how much stock value each category holds.',
      ['Category', 'Products', 'Units in Stock', 'Inventory Value', 'Low / Out'],
      [...byCategory.entries()]
        .sort((a, b) => b[1].products - a[1].products || a[0].localeCompare(b[0]))
        .map(([category, e]) => [
          category, e.products, e.units.toLocaleString(),
          `${formatCurrency(e.value)}${e.unpriced ? ` (${e.unpriced} without a price)` : ''}`,
          e.attention,
        ]),
      'No products found.');

    // Stock Health: products grouped by stock status.
    const order = ['Out of Stock', 'Low Stock', 'In Stock', 'No Stock Records'];
    const total = rows.length || 1;
    add('stockHealth', 'Stock Health', 'Products grouped by stock status: how many are in stock, low or out of stock.',
      ['Status', 'Products', 'Share of Products', 'Units in Stock', 'Products in this Status'],
      order
        .map((status) => [status, rows.filter((r) => r.status === status)])
        .filter(([, list]) => list.length > 0)
        .map(([status, list]) => [
          status, list.length, `${Math.round((list.length / total) * 100)}%`,
          sumBy(list, 'stock').toLocaleString(),
          list.map((r) => r.product),   // shown as chips in the pop-up
        ]),
      'No products found.');
  }
  return sections;
}

/* ===== SUMMARY CARDS (two rows of four; each opens a report) ===== */
function buildCards(report, formatCurrency) {
  const cards = [];
  const kpis = report?.stockSummary?.kpis;
  if (kpis) {
    const rows = report.stockSummary.rows || [];
    const categories = new Set(rows.map((r) => (r.category && r.category !== '—' ? r.category : 'No category'))).size;
    cards.push({ key: 'products', report: 'categoryBreakdown', Icon: Package, tone: 'gold', label: 'Products', value: Number(kpis.productCount || 0).toLocaleString(), sub: `${categories} categor${categories === 1 ? 'y' : 'ies'} · ${Number(kpis.totalStock || 0).toLocaleString()} units` });
    cards.push({
      key: 'value',
      report: 'stockSummary',
      Icon: Wallet,
      tone: 'good',
      label: 'Inventory Value',
      value: formatCurrency(kpis.inventoryValue),
      sub: `at latest Stock In price${kpis.unpricedProducts ? ` · ${kpis.unpricedProducts} without a price` : ''}`,
    });
  }
  if (report?.topMoving) {
    const rows = report.topMoving.rows || [];
    cards.push({ key: 'sold', report: 'topMoving', Icon: ShoppingBag, tone: 'violet', label: 'Units Sold', value: sumBy(rows, 'unitsSold').toLocaleString(), sub: `last 12 months · ${rows.length} product${rows.length === 1 ? '' : 's'}` });
  }
  if (report?.demandForecast) {
    const rows = report.demandForecast.rows || [];
    cards.push({ key: 'forecast', report: 'demandForecast', Icon: TrendingUp, tone: 'blue', label: 'Forecast This Month', value: Math.round(sumBy(rows, 'forecastedDemand')).toLocaleString(), sub: `units across ${rows.length} product${rows.length === 1 ? '' : 's'}` });
  }
  if (report?.autoCalculator) {
    const rows = report.autoCalculator.rows || [];
    // All calculations, not only the 50 newest shown in the table (2026-11-17).
    const total = Number(report.autoCalculator.total ?? rows.length);
    cards.push({ key: 'eoq', report: 'autoCalculator', Icon: Calculator, tone: 'violet', label: 'Order Quantity Calculations', value: total.toLocaleString(), sub: 'Economic Order Quantity results logged' });
  }
  if (report?.inventoryAging) {
    const rows = report.inventoryAging.rows || [];
    const aging = rows.filter((r) => r.status === 'Aging' || r.status === 'Slow Mover').length;
    cards.push({ key: 'aging', report: 'inventoryAging', Icon: Hourglass, tone: 'warn', label: 'Aging Stock', value: aging.toLocaleString(), sub: `of ${rows.length} product${rows.length === 1 ? '' : 's'} in stock (over 60 days)` });
  }
  return cards;
}

/* ===== WIDE CARD: Stock Health (segmented bar like the Dashboard) ===== */
function StockHealthTile({ rows, loading, onOpen }) {
  const count = (status) => rows.filter((r) => r.status === status).length;
  const parts = [
    { key: 'good', label: 'In stock', value: count('In Stock') },
    { key: 'warn', label: 'Low', value: count('Low Stock') },
    { key: 'bad', label: 'Out', value: count('Out of Stock') },
    // Products with no Stock Control entries yet (shown only when there are some).
    { key: 'none', label: 'No records', value: count('No Stock Records'), optional: true },
  ];
  const total = rows.length;
  const healthy = total ? Math.round((parts[0].value / total) * 100) : 0;
  return (
    <div className="r-kpi-card r-kpi-tile r-kpi-tile--good r-clickable r-health-tile" {...clickableProps(onOpen, 'Stock Health report')}>
      <span className="r-kpi-tile-head">
        <span className="r-kpi-tile-icon" aria-hidden="true"><ShieldCheck size={15} strokeWidth={1.9} /></span>
        <span className="r-kpi-label">Stock Health</span>
        <span className="r-kpi-tile-go" aria-hidden="true"><ArrowUpRight size={14} strokeWidth={2.2} /></span>
      </span>
      <div className="r-health-main">
        <div className="r-kpi-value"><MarqueeText>{loading ? '…' : <CountUp value={healthy} format={(n) => `${Math.round(n)}%`} />}</MarqueeText></div>
        <div className="r-kpi-sub">of {total} product{total === 1 ? '' : 's'} in stock</div>
      </div>
      <div className="r-health-bar">
        {parts.filter((p) => p.value > 0).map((p) => (
          <span
            key={p.key}
            className={`r-health-seg is-${p.key}`}
            style={{ flexGrow: p.value }}
            data-tip={`${p.label}\n${p.value} of ${total} products (${total ? Math.round((p.value / total) * 100) : 0}%)`}
          />
        ))}
      </div>
      <div className="r-health-legend">
        {parts.filter((p) => !p.optional || p.value > 0).map((p) => (
          <span key={p.key} data-tip={`${p.label}\n${p.value} of ${total} products (${total ? Math.round((p.value / total) * 100) : 0}%)`}><i className={`is-${p.key}`} />{p.label} <strong>{p.value}</strong></span>
        ))}
      </div>
    </div>
  );
}

/* ===== EXPORT HELPERS (one report, or all of them) ===== */
const toExportSection = (section) => ({
  title: section.title,
  headers: section.headers,
  rows: section.rows.map((row) => row.map((cell) => (
    cell == null ? '' : Array.isArray(cell) ? cell.join(', ') : cell
  ))),
});

async function exportExcel({ title, subtitle, fileName, sections, summary, scope }) {
  const exportSections = sections.map(toExportSection);
  await exportReportWorkbook({
    title,
    subtitle,
    fileName,
    sections: exportSections,
    summary,
    scope,
    note: exportSections.every((s) => s.rows.length === 0) ? 'No report rows were available at the time of export.' : '',
    columnWidths: Array.from({ length: Math.max(1, ...exportSections.map((s) => s.headers.length)) }, () => 24),
  });
}

function exportPdf({ title, subtitle, sections, summary, scope }) {
  const exportSections = sections.map(toExportSection);
  const opened = printReportPdf({
    title,
    subtitle,
    summary,
    sections: exportSections,
    scope,
    note: exportSections.every((s) => s.rows.length === 0) ? 'No report rows were available at the time of export.' : '',
  });
  if (!opened) throw new Error('Allow pop-ups for this site to export the PDF.');
}

const fileNameOf = (title) => title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/* ===== POP-UP: one report with all of its rows and its own export ===== */
/* ===== LONG NAME LISTS (2026-11-10) =====
   Stock Health can hold thousands of product names. The row shows a chevron
   and "View details"; the list opens under the row: a search box, then the
   names A–Z, one per line, in a bordered box that scrolls when long. */
const byName = (a, b) => String(a).localeCompare(String(b), undefined, { sensitivity: 'base', numeric: true });

function ListPanel({ items, label }) {
  const [query, setQuery] = useState('');
  const sorted = useMemo(() => [...items].sort(byName), [items]);
  const needle = query.trim().toLowerCase();
  const shown = needle ? sorted.filter((name) => String(name).toLowerCase().includes(needle)) : sorted;
  return (
    <div className="r-list-panel">
      <div className="r-list-panel-head">
        <span className="r-list-search-wrap">
        <Search size={15} className="r-list-search-icon" aria-hidden="true" />
        <input
          type="search"
          className="r-list-search"
          placeholder={`Search ${label ? `${label.toLowerCase()} ` : ''}products…`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label={`Search ${label || ''} products`}
          autoFocus
        />
        </span>
        <span className="r-list-count">
          {needle ? `${shown.length.toLocaleString()} of ${sorted.length.toLocaleString()}` : `${sorted.length.toLocaleString()} products`} · A–Z
        </span>
      </div>
      {shown.length === 0 ? (
        <p className="r-list-empty">No product matches “{query.trim()}”.</p>
      ) : (
        <ul className="r-list-items">
          {shown.map((name, index) => <li key={`${name}-${index}`} title={name}>{name}</li>)}
        </ul>
      )}
    </div>
  );
}

function ReportModal({ section, canExport, onClose }) {
  const [openListRow, setOpenListRow] = useState(null);   // which row's full list is open (its first cell)
  // The column holding a name list (Stock Health products), or -1.
  const listColumn = (section.rows || []).reduce((found, row) => (found >= 0 ? found : row.findIndex((cell) => Array.isArray(cell))), -1);
  const [exportError, setExportError] = useState('');

  /* ===== SEARCH + SORT + ROWS (2026-11-18) =====
     Search looks in every column. Sort: pick a column (or click its
     heading on a laptop); click again to flip high→low / low→high.
     Exports still contain every row in the report's own order. */
  const [query, setQuery] = useState('');
  const [sortColumn, setSortColumn] = useState('');      // '' = report's own order, else column index
  const [sortDir, setSortDir] = useState('desc');
  const needle = query.trim().toLowerCase();
  const shownRows = useMemo(() => {
    const matched = needle
      ? section.rows.filter((row) => row.some((cell) => cellText(cell).toLowerCase().includes(needle)))
      : section.rows;
    if (sortColumn === '') return matched;
    const index = Number(sortColumn);
    return [...matched].sort((a, b) => compareCells(a[index], b[index], sortDir === 'desc' ? -1 : 1));
  }, [section.rows, needle, sortColumn, sortDir]);
  const pager = usePagedRows(`report-${section.key}`, shownRows, { resetKey: `${needle}|${sortColumn}|${sortDir}` });
  const sortableHeaders = section.headers
    .map((header, index) => ({ header, index }))
    .filter(({ index }) => index !== listColumn);
  const sortOptions = [
    { value: '', label: 'Report order' },
    ...sortableHeaders.map(({ header, index }) => ({ value: String(index), label: header })),
  ];
  const sortBy = (index) => {
    if (String(index) === sortColumn) setSortDir((dir) => (dir === 'desc' ? 'asc' : 'desc'));
    else { setSortColumn(String(index)); setSortDir('desc'); }
  };
  const sortMark = (index) => (String(index) === sortColumn ? (sortDir === 'desc' ? ' ▼' : ' ▲') : '');

  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const options = {
    title: section.title,
    subtitle: section.note,
    fileName: fileNameOf(section.title),
    sections: [section],
    summary: [{ label: 'Records', value: section.rows.length }],
    scope: 'All rows of this report as of the time of export.',
  };
  const handleExcel = async () => {
    setExportError('');
    try { await exportExcel(options); } catch (error) {
      console.error(`Could not export ${section.title}:`, error);
      setExportError('Export failed. Please try again.');
    }
  };
  const handlePdf = () => {
    setExportError('');
    try { exportPdf(options); } catch (error) {
      console.error(`Could not export ${section.title} as PDF:`, error);
      setExportError(error.message || 'PDF export failed. Please try again.');
    }
  };

  return createPortal(
    <div className="r-modal-overlay" onClick={onClose}>
      <div
        className="r-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="r-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="r-modal-header">
          <div className="r-panel-title">
            <h2 id="r-modal-title">{section.title}</h2>
            <p>{section.note}</p>
            <PageToast message={exportError} type="error" onShown={() => setExportError('')} />
          </div>
          <div className="r-modal-actions">
            {canExport && (
              <>
                <button className="r-export-btn" type="button" onClick={handlePdf}>
                  <FileText size={13} /> Export PDF
                </button>
                <button className="r-export-btn" type="button" onClick={handleExcel}>
                  <Download size={13} /> Export Excel
                </button>
              </>
            )}
            <button type="button" className="r-modal-close" onClick={onClose} aria-label="Close" autoFocus>
              <X size={16} />
            </button>
          </div>
        </div>
        {/* ===== SEARCH + SORT BAR ===== */}
        {section.rows.length > 0 && (
          <div className="r-modal-tools">
            <span className="r-list-search-wrap r-modal-search">
              <Search size={15} className="r-list-search-icon" aria-hidden="true" />
              <input
                type="search"
                className="r-list-search"
                placeholder={`Search ${section.title.toLowerCase()}…`}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                aria-label={`Search ${section.title}`}
              />
            </span>
            <div className="r-modal-sort">
              <span className="r-modal-sort-label">Sort</span>
              <CustomSelect
                value={sortColumn}
                options={sortOptions}
                onChange={(value) => { setSortColumn(String(value)); setSortDir('desc'); }}
                ariaLabel="Sort by column"
                className="r-sort-select"
                floating
              />
              <button
                type="button"
                className="r-sort-dir"
                onClick={() => setSortDir((dir) => (dir === 'desc' ? 'asc' : 'desc'))}
                disabled={sortColumn === ''}
                title={sortDir === 'desc' ? 'High to low (Z–A). Click for low to high.' : 'Low to high (A–Z). Click for high to low.'}
                aria-label={sortDir === 'desc' ? 'Sorted high to low. Switch to low to high' : 'Sorted low to high. Switch to high to low'}
              >
                <ArrowUpDown size={14} aria-hidden="true" />
                <span>{sortColumn === '' ? '—' : (sortDir === 'desc' ? 'High–Low' : 'Low–High')}</span>
              </button>
            </div>
          </div>
        )}
        <div className="r-modal-body">
          <table className="r-table">
            <thead>
              {/* Sections with a name list (Stock Health): a chevron column on
                  the left and "Actions" instead of the list column (2026-11-10). */}
              <tr>
                {listColumn >= 0 && <th className="r-expand-th" aria-label="Expand" />}
                {section.headers.map((header, index) => (
                  index === listColumn
                    ? <th key={header}>Actions</th>
                    : (
                      <th key={header} aria-sort={String(index) === sortColumn ? (sortDir === 'desc' ? 'descending' : 'ascending') : undefined}>
                        <button type="button" className="r-th-sort" onClick={() => sortBy(index)} title={`Sort by ${header}`}>
                          {header}{sortMark(index)}
                        </button>
                      </th>
                    )
                ))}
              </tr>
            </thead>
            <tbody>
              {section.rows.length === 0 ? <EmptyRow cols={section.headers.length + (listColumn >= 0 ? 1 : 0)} text={section.emptyText} />
                : shownRows.length === 0 ? <EmptyRow cols={section.headers.length + (listColumn >= 0 ? 1 : 0)} text={`No row matches “${query.trim()}”.`} />
                : pager.visible.map((row, pageIndex) => {
                  const rowIndex = pager.offset + pageIndex;
                  // A name list (e.g. Stock Health products) opens under its row
                  // with a search box — fits shops with 2,000 products (2026-11-10).
                  const listCell = listColumn >= 0 ? row[listColumn] : null;
                  const hasList = Array.isArray(listCell) && listCell.length > 0;
                  const statusLabel = typeof row[0] === 'string' ? row[0] : '';
                  const rowKey = statusLabel || rowIndex;   // stays the same when sorted
                  const isOpen = hasList && openListRow === rowKey;
                  const toggle = () => setOpenListRow(isOpen ? null : rowKey);
                  return (
                    <Fragment key={`${rowKey}-${rowIndex}`}>
                      <tr className={isOpen ? 'r-row-open' : undefined}>
                        {listColumn >= 0 && (
                          <td className="r-expand-td">
                            {hasList && (
                              <button
                                type="button"
                                className={`r-expand-btn${isOpen ? ' is-open' : ''}`}
                                onClick={toggle}
                                aria-expanded={isOpen}
                                aria-label={`${isOpen ? 'Hide' : 'Show'} ${statusLabel} products`}
                              >
                                <ChevronDown size={15} />
                              </button>
                            )}
                          </td>
                        )}
                        {row.map((cell, cellIndex) => (
                          <td
                            key={cellIndex}
                            className={cellClass(section.headers[cellIndex], cell, cellIndex, section.key) || undefined}
                            data-label={cellIndex === listColumn ? 'Actions' : (SHORT_LABEL[section.headers[cellIndex]] || section.headers[cellIndex])}
                            title={typeof cell === 'string' && cellIndex !== listColumn && !BADGE[cell] ? cell : undefined}
                          >
                            {cellIndex === listColumn ? (
                              hasList ? (
                                <button type="button" className="r-details-link" onClick={toggle} aria-expanded={isOpen}>
                                  {isOpen ? 'Hide details' : 'View details'}
                                </button>
                              ) : '—'
                            ) : Array.isArray(cell) ? <span className="ui-ellipsis">{cell.join(', ')}</span>
                              : BADGE[cell] ? <Badge label={cell} /> : <span className="ui-ellipsis">{cell}</span>}
                          </td>
                        ))}
                      </tr>
                      {isOpen && (
                        <tr className="r-list-row">
                          <td colSpan={section.headers.length + 1}>
                            <ListPanel items={listCell} label={statusLabel} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
            </tbody>
          </table>
        </div>
        <div className="r-modal-footer">
          {pager.total > 0 ? (
            <RowsFooter pager={pager} noun={needle ? `of ${section.rows.length.toLocaleString()} rows` : (pager.total === 1 ? 'row' : 'rows')} label="Report rows per page" />
          ) : <>{section.rows.length.toLocaleString()} {section.rows.length === 1 ? 'row' : 'rows'}</>}
        </div>
      </div>
    </div>,
    document.body
  );
}

/* refreshKey changes whenever stock or products change elsewhere; isActive is
   true while the Reports page is on screen. The page stays mounted in the
   background, so it reloads on either (the main page checks for changes every
   few seconds). canTab(key) = Role Access for each report; canExport = may
   export. */
export default function ReportsAnalyticsDesign({ safetyStock, refreshKey = 0, isActive = true, canTab = () => true, canExport = true, handoff = null }) {
  const { formatCurrency } = useCurrency();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exportError, setExportError] = useState('');
  const [openKey, setOpenKey] = useState(null);   // which report's pop-up is open
  // The charts area stretches to the bottom of the page, so the left and right
  // columns end at the same line and nothing is cut off.
  const fillChartsToBottom = useFillToBottom();

  const anySectionAllowed = ['stock_summary', 'stock_movement', 'top_moving', 'fast_slow', 'demand_forecast', 'order_quantity', 'inventory_aging', 'reorder_point']
    .some((key) => canTab(key));

  useEffect(() => {
    if (!isActive) return undefined;
    let active = true;
    setLoading(true);
    setError('');
    fetch('/api/reports', { headers: { Accept: 'application/json' }, cache: 'no-store' })
      .then((r) => { if (!r.ok) throw new Error(`Could not load reports (${r.status}).`); return r.json(); })
      .then((data) => { if (active) setReport(data); })
      .catch((e) => { if (active) setError(e.message || 'Could not load reports.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [safetyStock, refreshKey, isActive]);

  const sections = useMemo(() => buildSections(report, formatCurrency), [report, formatCurrency]);
  const cards = useMemo(() => buildCards(report, formatCurrency), [report, formatCurrency]);
  const sectionByKey = useMemo(() => new Map(sections.map((section) => [section.key, section])), [sections]);
  const openSection = openKey ? sectionByKey.get(openKey) : null;

  /* Opened from another page with one report in mind (Dashboard → Top
     Products Sold arrow, 2026-11-17): open that report's pop-up once the
     data is in. Each click is a new handoff, so it opens every time. */
  const [handledHandoff, setHandledHandoff] = useState(null);
  useEffect(() => {
    if (handoff?.type !== 'open-report' || handoff === handledHandoff) return;
    if (!sectionByKey.has(handoff.report)) return;   // still loading, or hidden by Role Access
    setOpenKey(handoff.report);
    setHandledHandoff(handoff);
  }, [handoff, handledHandoff, sectionByKey]);
  const opener = (key) => (sectionByKey.has(key) ? () => setOpenKey(key) : null);

  const firstLoad = loading && !report;   // keep old numbers on screen while refreshing

  /* Export full report: every report, all rows, one file. */
  const fullOptions = {
    title: 'Overall Inventory Report',
    subtitle: 'All system data in one report: stock, movements, sales, forecasts, order quantities, aging and reorder needs',
    fileName: 'overall-inventory-report',
    sections,
    summary: cards.slice(0, 6).map(({ label, value }) => ({ label, value })),
    scope: 'Every report you have access to, with all of its rows, as of the time of export.',
  };
  const handleFullExcel = async () => {
    setExportError('');
    try { await exportExcel(fullOptions); } catch (exportFailure) {
      console.error('Could not export the overall report:', exportFailure);
      setExportError('Export failed. Please try again.');
    }
  };
  const handleFullPdf = () => {
    setExportError('');
    try { exportPdf(fullOptions); } catch (exportFailure) {
      console.error('Could not export the overall report as PDF:', exportFailure);
      setExportError(exportFailure.message || 'PDF export failed. Please try again.');
    }
  };

  /* "Export full report" buttons: bottom left, under the Stock In vs Out chart. */
  const fullExport = canExport ? (
    <div className="r-overall-toolbar">
      <button className="r-export-tile r-export-tile--pdf" type="button" onClick={handleFullPdf} disabled={firstLoad} title="Every report in one PDF">
        <span className="r-export-tile-icon" aria-hidden="true"><FileText size={16} strokeWidth={1.9} /></span>
        <span className="r-export-tile-text">
          <strong>Export full report</strong>
          <small>PDF · every report, ready to print</small>
        </span>
        <Download size={15} className="r-export-tile-go" aria-hidden="true" />
      </button>
      <button className="r-export-tile r-export-tile--excel" type="button" onClick={handleFullExcel} disabled={firstLoad} title="Every report in one Excel file">
        <span className="r-export-tile-icon" aria-hidden="true"><FileSpreadsheet size={16} strokeWidth={1.9} /></span>
        <span className="r-export-tile-text">
          <strong>Export full report</strong>
          <small>Excel · every report in one file</small>
        </span>
        <Download size={15} className="r-export-tile-go" aria-hidden="true" />
      </button>
      <PageToast message={exportError} type="error" onShown={() => setExportError('')} />
    </div>
  ) : null;

  const movementRows = report?.stockMovement?.rows || [];
  // Every part is there (no report hidden by Role Access): use the full layout.
  const complete = cards.length === 6 && Boolean(report?.stockSummary && report?.stockMovement
    && report?.fastSlowMoving && report?.reorderPoint);
  const fastSlow = report?.fastSlowMoving;

  if (!anySectionAllowed) {
    return (
      <div className="r-root r-overall">
        <p className="r-supplier-note" role="status">No reports are turned on for your role. Ask the Super Admin to turn them on in Settings → Role Access.</p>
      </div>
    );
  }

  return (
    <div className="r-root r-overall">
      {error ? (
        <p className="r-supplier-note" role="alert">{error}</p>
      ) : (
        <>
          {/* ===== ONE LAYOUT, EVERY CARD OPENS A DIFFERENT REPORT =====
               Row 1: four small cards. Row 2: two small cards + wide Stock
               Health card. Below: big Stock In vs Out chart on the left
               (export buttons under it), Fast-Moving and Needs Reorder on the
               right. If Role Access hides some reports, the cards that are
               left simply flow in order. */}
          <div className={`r-bento${complete ? '' : ' is-partial'}`} ref={fillChartsToBottom}>
            {cards.map((card, index) => (
              <div
                key={card.key}
                className={`r-kpi-card r-kpi-tile r-kpi-tile--${card.tone} r-clickable r-bento-k${index + 1}`}
                title={`Click to open the ${sectionByKey.get(card.report)?.title || 'report'}`}
                {...clickableProps(opener(card.report), sectionByKey.get(card.report)?.title || card.label)}
              >
                <span className="r-kpi-tile-head">
                  <span className="r-kpi-tile-icon" aria-hidden="true"><card.Icon size={15} strokeWidth={1.9} /></span>
                  <span className="r-kpi-label">{card.label}</span>
                  <span className="r-kpi-tile-go" aria-hidden="true"><ArrowUpRight size={14} strokeWidth={2.2} /></span>
                </span>
                <div className="r-kpi-value"><MarqueeText>{firstLoad ? '…' : <CountUpText text={card.value} />}</MarqueeText></div>
                <div className="r-kpi-sub">{card.sub}</div>
              </div>
            ))}
            {report?.stockSummary && (
              <div className="r-bento-health">
                <StockHealthTile rows={report.stockSummary.rows || []} loading={firstLoad} onOpen={opener('stockHealth')} />
              </div>
            )}
            {report?.stockMovement && (
              <div className="r-bento-movement">
                <MovementChartCard rows={movementRows} loading={firstLoad} onOpen={opener('stockMovement')} />
              </div>
            )}
            {fastSlow && (
              <div className="r-bento-fast">
                <MovementBars
                  title={`Fast-Moving (last ${fastSlow.windowDays || 90} days)`}
                  items={fastSlow.fast || []}
                  tone="fast"
                  emptyText={firstLoad ? 'Loading…' : 'No sales recorded in this period.'}
                  onOpen={opener('fastSlowMoving')}
                />
              </div>
            )}
            {report?.reorderPoint && (
              <div className="r-bento-reorder">
                <ReorderBars
                  rows={report.reorderPoint.rows || []}
                  emptyText={firstLoad ? 'Loading…' : 'All products are above their reorder point.'}
                  onOpen={opener('reorderPoint')}
                />
              </div>
            )}
            {fullExport}
          </div>
        </>
      )}

      {openSection && (
        <ReportModal section={openSection} canExport={canExport} onClose={() => setOpenKey(null)} />
      )}
    </div>
  );
}
