import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Package, Boxes, ShieldCheck, ShoppingBag, TrendingUp, TrendingDown, Minus, ArrowUpRight, ChevronRight, RefreshCw, Download } from 'lucide-react';
import './dashboard.css';
import { statusPointsFor } from '../../data/safetyStock';
import exportReportWorkbook from '../../utils/exportReportWorkbook';
import { uiZoom } from '../../fontSize';
import { CountUp } from '../../utils/countUp';

const fmt = (value) => Number(value || 0).toLocaleString('en-PH');

/* One short, plain label per reorder suggestion (full reasons stay in the tooltip). */
function reorderTag(item) {
  if (item.currentStock <= 0) return { label: 'Out of stock', level: 'out' };
  if (item.safetyStock != null && item.currentStock <= item.safetyStock) return { label: 'Below safety stock', level: 'out' };
  if (item.leadTimeDays != null && item.daysOfCover != null && item.daysOfCover < item.leadTimeDays) {
    return { label: 'Runs out before delivery', level: 'out' };
  }
  if (item.currentStock <= item.reorderPoint) return { label: 'Low stock', level: 'low' };
  return { label: 'Not enough for next month', level: 'soon' };
}
const localDateString = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60 * 1000)
    .toISOString()
    .slice(0, 10);
};
const categoryColors = {
  phone: '#43D39E',
  keyboard: '#4F9CF9',
  peripherals: '#F4C65B',
};
const fallbackCategoryColors = ['#A78BFA', '#FB7185', '#38BDF8', '#F97316', '#2DD4BF'];
/* Reorder List and Stock Alerts show this many full rows, then a "View all" link
   (instead of cutting a row in half at the bottom of the card). */
const LIST_LIMIT = 3;
/* Recent Activity shows the newest stock entries (as many as fit, up to this many). */
const ACTIVITY_LIMIT = 4;
const ACTIVITY_MAX = 12;
const REORDER_MAX = 12;
const pct = (part, whole) => (whole ? Math.round((part / whole) * 100) : 0);

/* ===== FILL THE CARD =====
   Reorder List and Recent Activity show as many whole rows as fit in their
   card (the card height comes from the tallest card in that row), instead
   of a fixed 3 / 4 rows with empty space underneath. Desktop only — on
   tablets and phones the cards grow with their rows, so the fixed number
   (fallback) is used. Re-measures when the card changes size. */
const FIT_DESKTOP = '(min-width: 1025px)';
function useFitCount(ref, fallback, deps = []) {
  const [count, setCount] = useState(fallback);
  useEffect(() => {
    const box = ref.current;
    if (!box || typeof ResizeObserver === 'undefined') return undefined;
    let frame = 0;
    const measure = () => {
      frame = 0;
      box.style.removeProperty('--fit-extra');   // measure at the normal row size
      if (!window.matchMedia(FIT_DESKTOP).matches) { setCount(fallback); return; }
      // Every row is in the page (the extra ones are invisible), so count the
      // rows whose bottom edge is inside the box. Rows may differ in height.
      const bottom = box.getBoundingClientRect().bottom + 0.5;
      const rows = Array.from(box.children);
      if (!rows.length) return;
      const fits = Math.max(1, rows.filter((row) => row.getBoundingClientRect().bottom <= bottom).length);
      setCount(fits);
      // When there are more rows than fit, the space left under the last whole
      // row is shared out: each shown row gets a little taller (see
      // --fit-extra in dashboard.css), so the card is filled to the bottom
      // with no empty strip. Screen sizes are divided by the font-size zoom.
      if (rows.length > fits) {
        const leftover = bottom - 0.5 - rows[fits - 1].getBoundingClientRect().bottom;
        if (leftover > 1) box.style.setProperty('--fit-extra', `${leftover / fits / uiZoom()}px`);
      }
    };
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(measure); };
    const observer = new ResizeObserver(schedule);
    observer.observe(box);
    window.addEventListener('resize', schedule);
    schedule();
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', schedule);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, deps);
  return count;
}

/* Small product photo for Top Products Sold; a box icon when there is no
   photo (or it can't be loaded). */
function ProductThumb({ src, name }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return <span className="db-ps-thumb is-empty" aria-hidden="true"><Package size={15} strokeWidth={1.8} /></span>;
  }
  return (
    <span className="db-ps-thumb">
      <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} />
      <span className="db-sr-only">{name}</span>
    </span>
  );
}

/* Recent Activity: initials and a steady colour per person. */
const AVATAR_COLORS = ['#F59E0B', '#60A5FA', '#34D399', '#A78BFA', '#FB7185', '#22D3EE', '#F97316'];
function initialsOf(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}
function colorOf(name) {
  const text = String(name || '');
  let hash = 7;
  for (let i = 0; i < text.length; i += 1) hash = (hash * 33 + text.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}
/* "just now", "5 min ago", "3 h ago", "2 days ago", then the date. */
function timeAgo(movement) {
  const when = movement.createdAt ? new Date(movement.createdAt) : (movement.date ? new Date(`${movement.date}T00:00:00`) : null);
  if (!when || Number.isNaN(when.getTime())) return '';
  const minutes = Math.floor((Date.now() - when.getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
  return when.toLocaleDateString('en', { month: 'short', day: 'numeric' });
}
function activityVerb(movement) {
  if (movement.isAdjustment) return 'Corrected';
  return movement.type === 'in' ? 'Received' : 'Sold';
}

/* Top KPI row: four cards, each answering a different question.
   tone = the card's accent colour (see .db-kpi-tile--<tone> in dashboard.css). */
const KPI_SKELETON = [
  { key: 'products', label: 'Products', Icon: Package, tone: 'gold' },
  { key: 'stock', label: 'Stock on Hand', Icon: Boxes, tone: 'blue' },
  { key: 'health', label: 'Stock Health', Icon: ShieldCheck, tone: 'good' },
  { key: 'sold', label: 'Units Sold This Month', Icon: ShoppingBag, tone: 'violet' },
];

/* One KPI card. It is a button because every card opens the related page. */
function KpiTile({ tone, Icon, label, value, unit, onClick, openLabel, children }) {
  return (
    <button type="button" className={`db-kpi-tile db-kpi-tile--${tone}`} onClick={onClick} title={openLabel}>
      <span className="db-kpi-tile-head">
        <span className="db-kpi-tile-icon" aria-hidden="true"><Icon size={16} strokeWidth={1.9} /></span>
        <span className="db-kpi-tile-label">{label}</span>
        <span className="db-kpi-tile-go" aria-hidden="true"><ArrowUpRight size={14} strokeWidth={2.2} /></span>
      </span>
      <span className="db-kpi-tile-value">
        {value}
        {unit && <small>{unit}</small>}
      </span>
      <span className="db-kpi-tile-foot">{children}</span>
      <span className="db-sr-only">{openLabel}</span>
    </button>
  );
}

function scalePoints(values, width, height, padX = 6, padTop = 10, padBottom = 8, bounds = null) {
  if (!values.length) return [];
  const max = bounds ? bounds.max : Math.max(...values);
  const min = bounds ? bounds.min : Math.min(...values);
  const range = max - min || 1;
  const innerWidth = width - padX * 2;
  const innerHeight = height - padTop - padBottom;
  const step = values.length > 1 ? innerWidth / (values.length - 1) : 0;

  return values.map((value, index) => [
    padX + index * step,
    padTop + innerHeight - ((value - min) / range) * innerHeight,
  ]);
}

function EmptyChart({ message = 'No data recorded yet' }) {
  return <div className="db-empty-chart">{message}</div>;
}

function OpenArrow() {
  return (
    <svg className="db-open-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 17L17 7" /><path d="M8 7h9v9" />
    </svg>
  );
}

/* ===== Sales Trend Overview helpers ===== */
const SALES_VIEWS = [['week', 'Weekly'], ['month', 'Monthly'], ['year', 'Yearly']];
const SALES_VIEW_WORD = { week: 'this week', month: 'this month', year: 'this year' };
// Bar chart: the hatched bar behind each bar is the same day / month one period earlier.
const SALES_PREV_WORD = { week: 'last week', month: 'last month', year: 'last year' };
const dateKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
/* Short axis numbers: 2000 → 2k, 1500 → 1.5k. */
const shortNumber = (value) => (value >= 1000 ? `${Number((value / 1000).toFixed(1))}k` : String(value));

/* Points for the Sales Trend Overview chart.
   Yearly  = this year, one point per month (Jan–Dec), from the same monthly
             sales the rest of the page uses (Stock Out + Past Sales).
   Monthly = this month, one point per day; Weekly = this week (Mon–Sun), one
             point per day. Daily points come from Stock Out entries (not
             corrections), because Past Sales are saved per month/week.
   Days or months that have not happened yet stay on the axis without a point. */
function buildSalesTrend(view, salesHistory, stockMovements) {
  const now = new Date();
  const todayKey = dateKey(now);
  if (view === 'year') {
    const year = now.getFullYear();
    const totals = new Map();
    salesHistory.forEach((record) => {
      const key = String(record.periodDate || '').slice(0, 7);
      if (!key.startsWith(`${year}-`) && !key.startsWith(`${year - 1}-`)) return;
      totals.set(key, (totals.get(key) || 0) + (Number(record.unitsSold) || 0));
    });
    return Array.from({ length: 12 }, (_, month) => {
      const date = new Date(year, month, 1);
      const key = `${year}-${String(month + 1).padStart(2, '0')}`;
      return {
        key,
        axis: date.toLocaleDateString('en', { month: 'short' }),
        title: date.toLocaleDateString('en', { month: 'long', year: 'numeric' }),
        showLabel: true,
        units: month <= now.getMonth() ? (totals.get(key) || 0) : null,
        // Same month last year.
        previous: totals.get(`${year - 1}-${String(month + 1).padStart(2, '0')}`) || 0,
      };
    });
  }
  // Daily views.
  let days;
  let previousOf;
  if (view === 'week') {
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
    days = Array.from({ length: 7 }, (_, i) => new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i));
    // Same weekday last week.
    previousOf = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate() - 7);
  } else {
    const count = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    days = Array.from({ length: count }, (_, i) => new Date(now.getFullYear(), now.getMonth(), i + 1));
    // Same day number last month (none when last month was shorter).
    const lastMonthDays = new Date(now.getFullYear(), now.getMonth(), 0).getDate();
    previousOf = (date) => (date.getDate() <= lastMonthDays ? new Date(date.getFullYear(), date.getMonth() - 1, date.getDate()) : null);
  }
  const totals = new Map();
  stockMovements.forEach((movement) => {
    if (movement.type !== 'out' || movement.isAdjustment) return;
    const qty = Number(movement.qty) || 0;
    if (qty <= 0) return;
    totals.set(movement.date, (totals.get(movement.date) || 0) + qty);
  });
  return days.map((date, index) => {
    const key = dateKey(date);
    const before = previousOf(date);
    return {
      key,
      axis: view === 'week' ? date.toLocaleDateString('en', { weekday: 'short' }) : String(date.getDate()),
      title: date.toLocaleDateString('en', { weekday: view === 'week' ? 'long' : undefined, month: 'long', day: 'numeric', year: 'numeric' }),
      // Monthly: label every 5th day (1, 5, 10 …) so the axis stays readable.
      showLabel: view === 'week' || index === 0 || (index + 1) % 5 === 0,
      units: key <= todayKey ? (totals.get(key) || 0) : null,
      previous: before ? (totals.get(dateKey(before)) || 0) : 0,
    };
  });
}

/* fetchSummary: shared loader from the main page (one request for the bell
   and the Dashboard). dataRevision: goes up when someone changes data, so an
   open Dashboard reloads by itself. */
const defaultFetchSummary = () => fetch('/api/dashboard/summary', { headers: { Accept: 'application/json' } })
  .then((response) => {
    if (!response.ok) {
      const error = new Error(`Request failed (${response.status}).`);
      error.status = response.status;
      throw error;
    }
    return response.json();
  });

function Dashboard({ onNavigate, isSuperAdmin = false, safetyStock, isActive = true, fetchSummary = defaultFetchSummary, dataRevision = 0 }) {
  // The other cards (Top Products Sold, units this month) look at the last 12 months.
  const range = 12;
  const [activeCategory, setActiveCategory] = useState(null);
  const [hoveredSalesMonth, setHoveredSalesMonth] = useState(null);
  // Sales Trend Overview: Weekly / Monthly / Yearly (saved in this browser).
  const [salesView, setSalesView] = useState(() => {
    try {
      const saved = localStorage.getItem('ggg-sales-view');
      return SALES_VIEWS.some(([key]) => key === saved) ? saved : 'year';
    } catch { return 'year'; }
  });
  const chooseSalesView = (view) => {
    setSalesView(view);
    setHoveredSalesMonth(null);
    try { localStorage.setItem('ggg-sales-view', view); } catch { /* storage blocked */ }
  };
  const [downloading, setDownloading] = useState(false);
  // Sales Trend as a line or a bar chart (saved in this browser).
  const [salesChart, setSalesChart] = useState(() => {
    try { return localStorage.getItem('ggg-sales-chart') === 'bar' ? 'bar' : 'line'; } catch { return 'line'; }
  });
  const chooseSalesChart = (type) => {
    setSalesChart(type);
    setHoveredSalesMonth(null);
    try { localStorage.setItem('ggg-sales-chart', type); } catch { /* storage blocked */ }
  };
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const summaryRequestRef = useRef(0);
  const reorderBoxRef = useRef(null);
  const activityBoxRef = useRef(null);
  const reorderFit = useFitCount(reorderBoxRef, LIST_LIMIT, [summary, loading]);
  const activityFit = useFitCount(activityBoxRef, ACTIVITY_LIMIT, [summary, loading]);

  const loadSummary = ({ quiet = false } = {}) => {
    const requestId = summaryRequestRef.current + 1;
    summaryRequestRef.current = requestId;
    if (!quiet) setLoading(true);
    setError('');
    fetchSummary()
      .catch((requestError) => {
        throw new Error(requestError.status ? `Dashboard data request failed (${requestError.status}).` : (requestError.message || 'Could not load dashboard data.'));
      })
      .then((data) => {
        if (requestId === summaryRequestRef.current) setSummary(data);
      })
      .catch((requestError) => {
        if (requestId === summaryRequestRef.current) {
          setError(requestError.message || 'Could not load dashboard data.');
        }
      })
      .finally(() => {
        if (requestId === summaryRequestRef.current) setLoading(false);
      });
  };

  useEffect(() => {
    if (!isActive) return undefined;

    loadSummary();
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') loadSummary();
    };
    window.addEventListener('focus', refreshWhenVisible);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      window.removeEventListener('focus', refreshWhenVisible);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [isActive]);

  /* Someone changed data (auto-refresh): reload quietly while on screen. */
  useEffect(() => {
    if (dataRevision > 0 && isActive) loadSummary({ quiet: true });
  }, [dataRevision]);

  const go = (tab, payload = null) => { if (onNavigate) onNavigate(tab, payload); };
  const derived = useMemo(() => {
    if (!summary) return null;
    const products = summary.products || [];
    const salesHistory = summary.salesHistory || [];
    const stockMovements = summary.stockMovements || [];
    const currentMonth = new Date();
    currentMonth.setDate(1);

    const monthly = Array.from({ length: range }, (_, index) => {
      const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - range + index + 1, 1);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      return {
        key,
        label: date.toLocaleDateString('en', { month: 'short' }),
        units: 0,
        records: 0,
      };
    });
    const monthIndex = new Map(monthly.map((month, index) => [month.key, index]));
    const visibleSales = [];
    salesHistory.forEach((record) => {
      const key = String(record.periodDate || '').slice(0, 7);
      const index = monthIndex.get(key);
      if (index === undefined) return;
      const unitsSold = Number(record.unitsSold) || 0;
      monthly[index].units += unitsSold;
      if (unitsSold > 0) monthly[index].records += 1;
      visibleSales.push(record);
    });

    const stock = products.map((product) => ({
      ...product,
      quantity: Number(product.stock) || 0,
      // Low / Critical points (Automatic or Manual, Settings → Advanced Options).
      ...(() => {
        const points = statusPointsFor({
          productId: product.id,
          productName: product.name,
          safetyStock: product.safetyStock,
          annualDemand: product.annualDemand,
          leadTimeDays: product.leadTimeDays,
        }, safetyStock);
        return { threshold: points.low, criticalAt: points.critical };
      })(),
    }));
    // Only products already tracked in Stock Control count toward alerts —
    // a brand-new product with no movements isn't "out of stock", just untracked.
    const tracked = stock.filter((product) => product.inStockControl);
    const outOfStock = tracked.filter((product) => product.quantity <= 0);
    const lowStock = tracked.filter((product) => product.quantity > 0 && product.quantity <= product.threshold);
    const inStock = stock.length - outOfStock.length - lowStock.length;
    /* Stock Health card: the SAME rule as Reports & Analytics (and the server):
       every product counts, 0 units = Out, at/below safety stock = Critical,
       at/below the reorder point = Low, otherwise In stock. (It used to count
       products with no stock entries yet as "in stock", so the two pages
       showed different numbers.) */
    const health = stock.reduce((counts, product) => {
      if (product.quantity <= 0) counts.out += 1;
      else if (product.quantity <= product.criticalAt) counts.critical += 1;
      else if (product.quantity <= product.threshold) counts.low += 1;
      else counts.in += 1;
      return counts;
    }, { in: 0, low: 0, critical: 0, out: 0 });
    const categories = Object.entries(stock.reduce((totals, product) => {
      const category = product.category || 'Uncategorized';
      totals[category] = (totals[category] || 0) + 1;
      return totals;
    }, {})).map(([name, count], index) => ({
      name,
      count,
      pct: stock.length ? count / stock.length : 0,
      color: categoryColors[name.trim().toLowerCase()] || fallbackCategoryColors[index % fallbackCategoryColors.length],
    })).sort((a, b) => b.count - a.count);
    const topCategories = categories.slice(0, 4);
    if (categories.length > 4) {
      const otherCount = categories.slice(4).reduce((total, category) => total + category.count, 0);
      const usedColors = new Set(topCategories.map((category) => category.color));
      const otherColor = fallbackCategoryColors.find((color) => !usedColors.has(color)) || '#64748B';
      topCategories.push({ name: 'Other', count: otherCount, pct: stock.length ? otherCount / stock.length : 0, color: otherColor });
    }
    /* Rose pie: a slice's angle is its share of products, and bigger
       categories also reach further out, so the largest stands out at a
       glance. Each slice carries a small % tag just outside its edge. */
    let angle = -Math.PI / 2;
    const maxPct = Math.max(...topCategories.map((category) => category.pct), 0.0001);
    const donut = topCategories.map((category) => {
      const sweep = category.pct * 2 * Math.PI;
      const outer = 24 + (category.pct / maxPct) * 26; // 24–50
      const inner = 9;
      const point = (radius, radians) => [60 + radius * Math.cos(radians), 60 + radius * Math.sin(radians)];
      const [x1, y1] = point(outer, angle);
      const [x2, y2] = point(outer, angle + sweep);
      const [ix1, iy1] = point(inner, angle + sweep);
      const [ix2, iy2] = point(inner, angle);
      const large = sweep > Math.PI ? 1 : 0;
      const path = sweep >= 2 * Math.PI - 0.001
        ? `M 60,${60 - outer} A ${outer},${outer} 0 1,1 59.99,${60 - outer} Z`
        : `M ${x1},${y1} A ${outer},${outer} 0 ${large},1 ${x2},${y2} L ${ix1},${iy1} A ${inner},${inner} 0 ${large},0 ${ix2},${iy2} Z`;
      const [labelX, labelY] = point(Math.max(28, Math.min(outer + 2, 48)), angle + sweep / 2);
      angle += sweep;
      return { ...category, path, labelX, labelY, pctLabel: `${Math.round(category.pct * 100)}%` };
    });

    const now = new Date();
    const dailyMovements = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6 + index);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      const count = stockMovements.filter((movement) => movement.date === key).length;
      return { key, count, label: date.toLocaleDateString('en', { weekday: 'short' }) };
    });
    const firstMonth = `${monthly[0]?.key || ''}-01`;
    const todayKey = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
    ].join('-');
    const topProducts = Object.values(stockMovements
      .filter((movement) => (
        movement.type === 'out'
        && !movement.isAdjustment
        && movement.date >= firstMonth
        && movement.date <= todayKey
        && Number(movement.qty) > 0
      ))
      .reduce((totals, movement) => {
        const id = movement.productId || movement.productName || 'Unknown product';
        if (!totals[id]) totals[id] = { id, name: movement.productName || id, units: 0 };
        totals[id].units += Number(movement.qty);
        return totals;
      }, {}))
      .sort((a, b) => b.units - a.units)
      .slice(0, 5)
      .map((item) => {
        // Photo, category and stock now come from the product list.
        const product = stock.find((entry) => entry.id === item.id);
        return {
          ...item,
          image: product?.image || null,
          category: product?.category || '',
          stock: product ? product.quantity : null,
          stockLevel: !product ? '' : product.quantity <= 0 ? 'is-out' : product.quantity <= product.threshold ? 'is-low' : '',
        };
      });
    const topProductsTotal = topProducts.reduce((total, item) => total + item.units, 0);
    // Recent Activity: newest stock entries first.
    const recentActivity = [...stockMovements]
      .sort((a, b) => String(b.createdAt || b.date || '').localeCompare(String(a.createdAt || a.date || '')) || (b.id || 0) - (a.id || 0))
      .slice(0, ACTIVITY_MAX);
    const alerts = [
      ...outOfStock.map((product) => ({ ...product, level: 'out' })),
      ...lowStock.sort((a, b) => a.quantity - b.quantity).map((product) => ({
        ...product,
        level: product.quantity <= product.criticalAt ? 'critical' : 'low',
      })),
    ];
    const assignedProducts = stock.filter((product) => product.supplierId).length;
    const soldProductCount = new Set(
      visibleSales.filter((record) => Number(record.unitsSold) > 0).map((record) => record.productId).filter(Boolean)
    ).size;
    const hasSalesData = monthly.some((month) => month.units > 0);
    const hasMovementData = dailyMovements.some((day) => day.count > 0);
    const today = localDateString();
    const movementsToday = stockMovements.filter((movement) => movement.date === today).length;

    return {
      products: stock,
      totalProducts: stock.length,
      totalStock: stock.reduce((total, product) => total + product.quantity, 0),
      inStock,
      lowStock,
      outOfStock,
      health,
      categories: topCategories,
      donut,
      monthly,
      visibleSales,
      unitsSold: monthly.reduce((total, month) => total + month.units, 0),
      salesRecordCount: visibleSales.length,
      hasSalesData,
      hasMovementData,
      topProducts,
      topProductsTotal,
      recentActivity,
      dailyMovements,
      movementCount: dailyMovements.reduce((total, day) => total + day.count, 0),
      movementsToday,
      alerts,
      assignedProducts,
      unassignedProducts: stock.length - assignedProducts,
      supplierCoverage: stock.length ? Math.round((assignedProducts / stock.length) * 100) : 0,
      soldProductCount,
      maxCategory: Math.max(1, ...topCategories.map((category) => category.count)),
      maxProduct: Math.max(1, ...topProducts.map((product) => product.units)),
      maxMovement: Math.max(1, ...dailyMovements.map((day) => day.count)),
    };
  }, [summary, range, safetyStock]);

  if (loading && !summary) {
    return (
      <main className="dashboard-content-view">
        <div className="dashboard-scroll-container">
          <div className="db-kpi-row db-kpi-skeleton" aria-hidden="true">
            {KPI_SKELETON.map(({ key, label, Icon, tone }) => (
              <div className={`db-kpi-tile db-kpi-tile--${tone} is-skeleton`} key={key}>
                <span className="db-kpi-tile-head">
                  <span className="db-kpi-tile-icon"><Icon size={16} strokeWidth={1.9} /></span>
                  <span className="db-kpi-tile-label">{label}</span>
                </span>
                <span className="db-skel-line db-kpi-tile-skel-value" />
                <span className="db-skel-line db-kpi-tile-skel-foot" />
              </div>
            ))}
          </div>
          <div className={`parent db-grid${isSuperAdmin ? '' : ' parent-without-user-accounts'} db-skeleton`} aria-busy="true" aria-label="Loading dashboard">
            <div className="salesAnalytics-card card db-skel-card">
              <div className="db-skel-line db-skel-title" />
              <div className="db-skel-line db-skel-sub" />
              <div className="db-skel-chart" />
            </div>
            <div className="coverage-card card db-skel-card"><div className="db-skel-line db-skel-title" /><div className="db-skel-fill" /></div>
            <div className="category-card card db-skel-card"><div className="db-skel-line db-skel-title" /><div className="db-skel-fill" /></div>
            <div className="regionalBreakdown-card card db-skel-card"><div className="db-skel-line db-skel-title" /><div className="db-skel-fill" /></div>
            <div className="totalOrder-card card db-skel-card"><div className="db-skel-line db-skel-title" /><div className="db-skel-fill" /></div>
            <div className="activity-card card db-skel-card"><div className="db-skel-line db-skel-title" /><div className="db-skel-fill" /></div>
            <div className="productSales-card card db-skel-card"><div className="db-skel-line db-skel-title" /><div className="db-skel-fill" /></div>
          </div>
          <p className="db-skel-note" role="status">Loading live dashboard data…</p>
        </div>
      </main>
    );
  }
  if (error && !summary) {
    return (
      <main className="dashboard-content-view">
        <div className="dashboard-scroll-container">
          <p role="alert">{error}</p>
          <button type="button" onClick={loadSummary}>Try again</button>
        </div>
      </main>
    );
  }
  if (!derived) return null;

  /* ===== Top KPI numbers =====
     Everything comes from the same summary data the rest of the page uses —
     nothing new is calculated on the server and nothing is estimated. */
  const kpi = (() => {
    const current = derived.monthly[derived.monthly.length - 1];
    const previous = derived.monthly[derived.monthly.length - 2];
    const monthKey = current?.key || '';
    // Stock entries this month: Stock In adds, Stock Out removes; a
    // Correction is saved as an In or Out of the difference, so it counts too.
    let stockIn = 0;
    let stockOut = 0;
    (summary.stockMovements || []).forEach((movement) => {
      if (String(movement.date || '').slice(0, 7) !== monthKey) return;
      const qty = Number(movement.qty) || 0;
      if (movement.type === 'in') stockIn += qty;
      else stockOut += qty;
    });
    const total = derived.products.length;
    const now = new Date();
    const monthName = (key) => {
      const [y, m] = String(key).split('-').map(Number);
      return new Date(y, m - 1, 1).toLocaleDateString('en', { month: 'long' });
    };
    return {
      total,
      categoryCount: new Set(derived.products.map((product) => (product.category || 'Uncategorized').trim().toLowerCase())).size,
      trackedCount: derived.products.filter((product) => product.inStockControl).length,
      productsWithStock: derived.products.filter((product) => product.quantity > 0).length,
      stockIn,
      stockOut,
      netChange: stockIn - stockOut,
      hasEntriesThisMonth: stockIn + stockOut > 0,
      healthyPct: total ? Math.round((derived.health.in / total) * 100) : null,
      attention: derived.lowStock.length + derived.outOfStock.length,
      soldThisMonth: current?.units || 0,
      soldLastMonth: previous?.units || 0,
      lastMonthName: previous ? monthName(previous.key) : '',
      thisMonthName: current ? monthName(current.key) : '',
      // Share of last month's total reached so far (only when last month had sales).
      shareOfLastMonth: previous?.units ? Math.round(((current?.units || 0) / previous.units) * 100) : null,
      dayOfMonth: now.getDate(),
      daysInMonth: new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate(),
    };
  })();
  // Stock Health colour: green when all fine, amber when only low, red when anything is out.
  const healthTone = derived.health.out || derived.health.critical ? 'bad' : (derived.health.low ? 'warn' : 'good');
  const NetIcon = kpi.netChange > 0 ? TrendingUp : (kpi.netChange < 0 ? TrendingDown : Minus);
  const netClass = kpi.netChange > 0 ? 'is-up' : (kpi.netChange < 0 ? 'is-down' : 'is-flat');

  /* ===== Sales Trend Overview chart =====
     Line: thin line with straight steps between points. Bar: rounded bars,
     with a hatched bar behind each one for the same period one step earlier
     (last year / last month / last week). The axis starts at 0 so each
     point's height is its true share of the axis top. */
  const isBarChart = salesChart === 'bar';
  const trend = buildSalesTrend(salesView, summary.salesHistory || [], summary.stockMovements || []);
  const trendValues = trend.map((point) => point.units ?? 0);
  const previousValues = trend.map((point) => point.previous || 0);
  const trendTotal = trendValues.reduce((sum, value) => sum + value, 0);
  const trendHasData = trendTotal > 0 || (isBarChart && previousValues.some((value) => value > 0));
  // Axis top = 5 round steps (1, 2, 2.5 or 5 × 10ⁿ), e.g. peak 7,400 → 0 · 2k · 4k … 10k.
  const trendStep = (() => {
    const peak = Math.max(0, ...trendValues, ...(isBarChart ? previousValues : []));
    const raw = Math.max(1, peak / 5);
    const magnitude = 10 ** Math.floor(Math.log10(raw));
    return [1, 2, 2.5, 5, 10].find((s) => s * magnitude >= raw) * magnitude;
  })();
  const heroTop = trendStep * 5;
  // Bars sit in the middle of equal slots; the line runs edge to edge.
  const heroPadX = isBarChart ? 520 / (trend.length * 2 || 1) : 10;
  const heroPoints = scalePoints(trendValues, 520, 150, heroPadX, 16, 12, { min: 0, max: heroTop });
  const previousPoints = scalePoints(previousValues, 520, 150, heroPadX, 16, 12, { min: 0, max: heroTop });
  const drawnCount = trend.filter((point) => point.units != null).length;
  const heroLine = heroPoints.slice(0, drawnCount).map(([x, y], index) => `${index ? 'L' : 'M'} ${x},${y}`).join(' ');
  const heroStep = heroPoints.length > 1 ? heroPoints[1][0] - heroPoints[0][0] : 520;
  const heroBarWidth = Math.min(26, heroStep * 0.58);
  // Six axis numbers like 0 · 2k · 4k · 6k · 8k · 10k.
  const heroTicks = [1, 0.8, 0.6, 0.4, 0.2, 0].map((share) => ({ value: Math.round(heroTop * share), y: 138 - share * 122 }));
  const plotLeft = (x) => `calc(var(--plot-pad, 0px) + (100% - var(--plot-pad, 0px)) * ${x / 520})`;
  const hovered = hoveredSalesMonth !== null && trend[hoveredSalesMonth] && trend[hoveredSalesMonth].units != null ? hoveredSalesMonth : null;
  const periodWord = salesView === 'year' ? 'This year' : salesView === 'month' ? 'This month' : 'This week';
  const previousWord = SALES_PREV_WORD[salesView].replace(/^./, (c) => c.toUpperCase());

  /* Download Report: the numbers behind the chart as an Excel file
     (same layout as the Reports page exports). */
  const downloadSalesReport = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      const viewName = SALES_VIEWS.find(([key]) => key === salesView)[1];
      const period = salesView === 'year' ? 'Month' : 'Day';
      await exportReportWorkbook({
        title: 'Sales Trend Overview',
        subtitle: `${viewName} view · units sold ${SALES_VIEW_WORD[salesView]}`,
        fileName: `sales-trend-${salesView === 'year' ? 'yearly' : salesView === 'month' ? 'monthly' : 'weekly'}`,
        summary: [
          { label: `Total units sold ${SALES_VIEW_WORD[salesView]}`, value: trendTotal },
          { label: `Highest ${period.toLowerCase()}`, value: Math.max(0, ...trendValues) },
        ],
        sections: [{
          title: `Units sold per ${period.toLowerCase()}`,
          headers: [period, 'Units sold', `Units sold ${SALES_PREV_WORD[salesView]}`],
          rows: trend.filter((point) => point.units != null).map((point) => [point.title, point.units, point.previous || 0]),
        }],
        scope: salesView === 'year'
          ? 'Stock Out entries (not corrections) and Past Sales, per month'
          : 'Stock Out entries (not corrections), per day',
        columnWidths: [30, 18, 24],
      });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <main className="dashboard-content-view">
      <div className="dashboard-scroll-container">
        {error && <p role="alert">{error} Showing the last data loaded.</p>}
        <section className="db-kpi-row" aria-label="Inventory summary">
          {/* 1. Products — the size of the catalogue */}
          <KpiTile
            tone="gold"
            Icon={Package}
            label="Products"
            value={<CountUp value={kpi.total} />}
            unit={kpi.total === 1 ? 'product' : 'products'}
            onClick={() => go('Product-Supplier', { section: 'products' })}
            openLabel="Open the Products list"
          >
            {kpi.total ? (
              <>
                <span className="db-kpi-pill">{fmt(kpi.categoryCount)} {kpi.categoryCount === 1 ? 'category' : 'categories'}</span>
                <span className="db-kpi-note">{fmt(kpi.trackedCount)} tracked in Stock Control</span>
              </>
            ) : <span className="db-kpi-note">No products added yet</span>}
          </KpiTile>

          {/* 2. Stock on Hand — total units now, and how much it changed this month */}
          <KpiTile
            tone="blue"
            Icon={Boxes}
            label="Stock on Hand"
            value={<CountUp value={derived.totalStock} />}
            unit="units"
            onClick={() => go('Stock', { view: 'stock' })}
            openLabel="Open Stock Control"
          >
            {kpi.hasEntriesThisMonth ? (
              <>
                <span className={`db-kpi-trend ${netClass}`}>
                  <NetIcon size={12} strokeWidth={2.4} aria-hidden="true" />
                  {kpi.netChange > 0 ? '+' : kpi.netChange < 0 ? '−' : ''}{fmt(Math.abs(kpi.netChange))} this month
                </span>
                <span className="db-kpi-note">In {fmt(kpi.stockIn)} · Out {fmt(kpi.stockOut)}</span>
              </>
            ) : (
              <span className="db-kpi-note">
                {fmt(kpi.productsWithStock)} of {fmt(kpi.total)} products have stock · no entries in {kpi.thisMonthName} yet
              </span>
            )}
          </KpiTile>

          {/* 3. Stock Health — share of products that are not low or out of stock */}
          <KpiTile
            tone={healthTone}
            Icon={ShieldCheck}
            label="Stock Health"
            value={kpi.healthyPct == null ? '—' : <CountUp value={kpi.healthyPct} format={(n) => `${Math.round(n)}%`} />}
            unit={kpi.healthyPct == null ? '' : 'in stock'}
            onClick={() => go('Reorder-Alerts')}
            openLabel="Open Reorder List"
          >
            {kpi.total ? (
              <>
                <span className="db-kpi-bar db-kpi-bar-hover" aria-hidden="true">
                  {[['is-good', derived.health.in, 'In stock'], ['is-warn', derived.health.low, 'Low stock'], ['is-crit', derived.health.critical, 'Critical'], ['is-bad', derived.health.out, 'Out of stock']]
                    .filter(([, count]) => count > 0)
                    .map(([level, count, name]) => (
                      <span
                        key={level}
                        className={`db-kpi-bar-seg ${level}`}
                        style={{ width: `${(count / kpi.total) * 100}%` }}
                        data-tip={`${name}\n${fmt(count)} of ${fmt(kpi.total)} products (${pct(count, kpi.total)}%)`}
                      />
                    ))}
                </span>
                <span className="db-kpi-legend">
                  <span data-tip={`In stock\n${fmt(derived.health.in)} of ${fmt(kpi.total)} products (${pct(derived.health.in, kpi.total)}%)`}><i className="is-good" />{fmt(derived.health.in)} in stock</span>
                  <span data-tip={`Low stock\n${fmt(derived.health.low)} of ${fmt(kpi.total)} products (${pct(derived.health.low, kpi.total)}%)\nAt or below the reorder point`}><i className="is-warn" />{fmt(derived.health.low)} low</span>
                  <span data-tip={`Critical\n${fmt(derived.health.critical)} of ${fmt(kpi.total)} products (${pct(derived.health.critical, kpi.total)}%)\nAt or below safety stock`}><i className="is-crit" />{fmt(derived.health.critical)} critical</span>
                  <span data-tip={`Out of stock\n${fmt(derived.health.out)} of ${fmt(kpi.total)} products (${pct(derived.health.out, kpi.total)}%)`}><i className="is-bad" />{fmt(derived.health.out)} out</span>
                  {derived.health.low + derived.health.critical + derived.health.out > 0 && <span className="db-kpi-pulse" aria-hidden="true" />}
                </span>
              </>
            ) : <span className="db-kpi-note">No products to check yet</span>}
          </KpiTile>

          {/* 4. Units Sold This Month — compared with last month's full total */}
          <KpiTile
            tone="violet"
            Icon={ShoppingBag}
            label="Units Sold This Month"
            value={<CountUp value={kpi.soldThisMonth} />}
            unit="units"
            onClick={() => go('Forecasting')}
            openLabel="Open Forecasting"
          >
            {kpi.shareOfLastMonth != null ? (
              <>
                <span
                  className="db-kpi-progress"
                  aria-hidden="true"
                  data-tip={`${kpi.thisMonthName} so far\n${fmt(kpi.soldThisMonth)} units sold\n${fmt(kpi.shareOfLastMonth)}% of ${kpi.lastMonthName}'s ${fmt(kpi.soldLastMonth)}`}
                >
                  <span style={{ width: `${Math.min(100, kpi.shareOfLastMonth)}%` }} />
                </span>
                <span className="db-kpi-note">
                  <strong>{fmt(kpi.shareOfLastMonth)}%</strong> of {kpi.lastMonthName}’s {fmt(kpi.soldLastMonth)} · day {kpi.dayOfMonth} of {kpi.daysInMonth}
                </span>
              </>
            ) : (
              <span className="db-kpi-note">No sales recorded in {kpi.lastMonthName} to compare · day {kpi.dayOfMonth} of {kpi.daysInMonth}</span>
            )}
          </KpiTile>
        </section>
        <div className={`parent db-grid${isSuperAdmin ? '' : ' parent-without-user-accounts'}`}>
          <div className={`salesAnalytics-card card db-trend-card${isBarChart ? ' is-bars' : ''}`}>
            <div className="db-card-head db-trend-head">
              <div className="db-card-titles">
                <span className="db-card-title">Sales Trend Overview</span>
                <span className="db-card-sub">Track units sold to spot seasonal trends and growth.</span>
              </div>
              <div className="db-trend-actions">
                <div className="db-seg" role="group" aria-label="Sales period">
                  {SALES_VIEWS.map(([key, label]) => (
                    <button key={key} type="button" className={`db-seg-btn ${salesView === key ? 'active' : ''}`} aria-pressed={salesView === key} onClick={() => chooseSalesView(key)}>
                      {label}
                    </button>
                  ))}
                </div>
                <div className="db-seg" role="group" aria-label="Chart type">
                  {[['line', 'Line'], ['bar', 'Bar']].map(([type, label]) => (
                    <button key={type} type="button" className={`db-seg-btn ${salesChart === type ? 'active' : ''}`} aria-pressed={salesChart === type} onClick={() => chooseSalesChart(type)}>
                      {label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className={`db-trend-icon-btn${loading ? ' is-busy' : ''}`}
                  onClick={() => loadSummary()}
                  aria-label="Refresh data"
                  data-tip="Refresh data"
                >
                  <RefreshCw size={14} strokeWidth={2} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className={`db-trend-icon-btn${downloading ? ' is-busy-soft' : ''}`}
                  onClick={downloadSalesReport}
                  disabled={downloading}
                  aria-label="Download report (Excel)"
                  data-tip="Download report (Excel)"
                >
                  <Download size={14} strokeWidth={2} aria-hidden="true" />
                </button>
              </div>
            </div>
            <div className="db-trend-total">
              <span className="db-trend-total-label">Total units sold {SALES_VIEW_WORD[salesView]}</span>
              <strong><CountUp value={trendTotal} /></strong>
            </div>
            <div key={`${salesView}-${salesChart}`} className={`db-hero-plot db-trend-plot${trendHasData ? '' : ' db-chart-empty-plot'}`}>
              {trendHasData ? (
                <>
                  <div className="db-hero-yaxis" aria-hidden="true">
                    {heroTicks.map((tick) => (
                      <span key={tick.y} style={{ top: `${(tick.y / 150) * 100}%` }}>{shortNumber(tick.value)}</span>
                    ))}
                  </div>
                  <svg className="db-hero-svg" viewBox="0 0 520 150" preserveAspectRatio="none" aria-label={`Units sold ${SALES_VIEW_WORD[salesView]}`}>
                    <defs>
                      <linearGradient id="dbTrendBarFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--accent)" stopOpacity="1" />
                        <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.4" />
                      </linearGradient>
                      <pattern id="dbTrendHatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                        <line x1="0" y1="0" x2="0" y2="5" className="db-trend-hatch-line" />
                      </pattern>
                    </defs>
                    {/* Dotted guide lines from top to bottom at each labelled point. */}
                    {trend.map((point, index) => (point.showLabel ? (
                      <line key={`grid-${point.key}`} className="db-trend-vline" x1={heroPoints[index][0]} y1="16" x2={heroPoints[index][0]} y2="138" vectorEffect="non-scaling-stroke" />
                    ) : null))}
                    <line className="db-trend-baseline" x1="0" y1="138" x2="520" y2="138" vectorEffect="non-scaling-stroke" />
                    {isBarChart && previousPoints.map(([x, y], index) => (previousValues[index] > 0 ? (
                      <rect key={`prev-${trend[index].key}`} className="db-trend-ghost" x={x - heroBarWidth / 2} y={y} width={heroBarWidth} height={Math.max(0, 138 - y)} rx="3" fill="url(#dbTrendHatch)" />
                    ) : null))}
                    {isBarChart && heroPoints.slice(0, drawnCount).map(([x, y], index) => (
                      <rect
                        key={`bar-${trend[index].key}`}
                        className={`db-sales-bar db-trend-bar${hovered === index ? ' is-active' : ''}${hovered !== null && hovered !== index ? ' is-dimmed' : ''}`}
                        x={x - heroBarWidth / 2}
                        y={y}
                        width={heroBarWidth}
                        height={Math.max(0, 138 - y)}
                        rx="3"
                        fill="url(#dbTrendBarFill)"
                        style={{ animationDelay: `${index * 35}ms` }}
                      />
                    ))}
                    {!isBarChart && hovered !== null && (
                      <line className="db-trend-guide" x1={heroPoints[hovered][0]} y1={heroPoints[hovered][1]} x2={heroPoints[hovered][0]} y2="138" vectorEffect="non-scaling-stroke" />
                    )}
                    {!isBarChart && <path className="db-trend-line" d={heroLine} fill="none" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />}
                    {heroPoints.map(([x], index) => (trend[index].units != null ? (
                      <rect
                        key={trend[index].key}
                        className="db-hero-point db-trend-hit"
                        x={x - heroStep / 2}
                        y="0"
                        width={heroStep}
                        height="150"
                        tabIndex={0}
                        role="img"
                        aria-label={`${trend[index].title}: ${fmt(trend[index].units)} units sold`}
                        onMouseEnter={() => setHoveredSalesMonth(index)}
                        onMouseLeave={() => setHoveredSalesMonth(null)}
                        onFocus={() => setHoveredSalesMonth(index)}
                        onBlur={() => setHoveredSalesMonth(null)}
                      />
                    ) : null))}
                  </svg>
                  {hovered !== null && (
                    <>
                      {!isBarChart && (
                        <span
                          className="db-trend-dot"
                          style={{ left: plotLeft(heroPoints[hovered][0]), top: `${(heroPoints[hovered][1] / 150) * 100}%` }}
                          aria-hidden="true"
                        />
                      )}
                      <div
                        className={`db-hero-tooltip db-trend-tag${heroPoints[hovered][0] > 390 ? ' db-hero-tooltip-left' : ''}`}
                        style={{ left: plotLeft(heroPoints[hovered][0]), top: `${(heroPoints[hovered][1] / 150) * 100}%` }}
                        role="status"
                        aria-live="polite"
                      >
                        <strong>{fmt(trend[hovered].units)} units</strong>
                        <span>Sales on {trend[hovered].title}</span>
                        {isBarChart && <span>{previousWord}: {fmt(trend[hovered].previous || 0)} units</span>}
                      </div>
                    </>
                  )}
                </>
              ) : <EmptyChart message={`No sales recorded ${SALES_VIEW_WORD[salesView]}`} />}
            </div>
            {trendHasData && (
              <div key={`axis-${salesView}-${salesChart}`} className={`db-trend-xaxis${isBarChart ? ' is-bars' : ''}`} aria-hidden="true">
                {trend.map((point, index) => (point.showLabel
                  ? <span key={point.key} style={{ left: plotLeft(heroPoints[index][0]) }}>{point.axis}</span>
                  : null))}
              </div>
            )}
            <div className="db-trend-legend">
              <span><i aria-hidden="true" />{isBarChart ? periodWord : 'All products'}</span>
              {isBarChart && <span><i className="is-hatch" aria-hidden="true" />{previousWord}</span>}
            </div>
          </div>

          {/* ===== REORDER SUGGESTIONS (demand-linked) =====
              Server-computed from next month's forecast, current stock, safety
              stock and lead time. Recommendations only — nothing is order. */}
          <div className="regionalBreakdown-card card">
            <div className="db-card-head">
              <div className="db-card-titles">
                <span className="db-card-title">Reorder List</span>
                <span className="db-card-sub">
                  Based on next month’s forecast
                  {(summary.reorderSuggestions || []).length ? ` · ${fmt(summary.reorderSuggestions.length)} product${summary.reorderSuggestions.length === 1 ? '' : 's'}` : ''}
                </span>
              </div>
              <button className="db-open-arrow-btn" onClick={() => go('Reorder-Alerts')} aria-label="Open Reorder List" type="button"><OpenArrow /></button>
            </div>
            {(summary.reorderSuggestions || []).length ? (
              <>
              <div className="db-order-list db-fit-box" ref={reorderBoxRef}>
                {summary.reorderSuggestions.slice(0, REORDER_MAX).map((item, index) => {
                  const tag = reorderTag(item);
                  return (
                    <button
                      key={item.productId}
                      type="button"
                      className={`db-order-row is-${tag.level}${index >= reorderFit ? ' db-fit-hidden' : ''}`}
                      aria-hidden={index >= reorderFit || undefined}
                      tabIndex={index >= reorderFit ? -1 : undefined}
                      onClick={() => go('Stock', { highlightProductId: item.productId })}
                      title={item.reasons.join('\n')}
                    >
                      <span className="db-order-info">
                        <span className="db-order-name">{item.productName}</span>
                        <span className="db-order-meta">
                          <span className="db-order-tag">{tag.label}</span>
                          {item.currentStock <= 0
                            ? 'None left'
                            : `${fmt(item.currentStock)} left${item.daysOfCover != null ? ` · ~${fmt(Math.floor(item.daysOfCover))} days` : ''}`}
                        </span>
                      </span>
                      <span className="db-order-qty">
                        <small>Order</small>
                        <strong>{fmt(item.suggestedQty)}</strong>
                      </span>
                    </button>
                  );
                })}
              </div>
              {summary.reorderSuggestions.length > reorderFit && (
                <button type="button" className="db-list-more" onClick={() => go('Reorder-Alerts')}>
                  View all {fmt(summary.reorderSuggestions.length)} in the Reorder List →
                </button>
              )}
              </>
            ) : (
              <div className="db-order-empty">
                <strong>All good</strong>
                <span>Stock covers next month for every product.</span>
              </div>
            )}
          </div>

          {/* Supplier Coverage and Inventory by Category: two separate cards
              in the right column beside Sales History. */}
          <div className="coverage-card card">
            <button className="db-open-arrow-btn db-coverage-open-btn" onClick={() => go('Product-Supplier', { section: 'suppliers' })} aria-label="Open suppliers" type="button"><OpenArrow /></button>
            <div className="db-coverage-section">
              <div className="db-card-titles">
                <span className="db-card-title">Supplier Coverage</span>
                <span className="db-card-sub">Products linked to a supplier</span>
              </div>
              {/* Ring (share of products with a supplier) + detail rows. */}
              <div className="db-cov">
                <div className="db-cov-ring">
                  <svg viewBox="0 0 120 120" aria-label={`${derived.supplierCoverage}% supplier coverage`}>
                    <circle className="db-cov-track" cx="60" cy="60" r="48" pathLength="100" />
                    {derived.products.length > 0 && derived.assignedProducts > 0 && (
                      <circle
                        className="db-cov-arc is-linked"
                        cx="60"
                        cy="60"
                        r="48"
                        pathLength="100"
                        strokeDasharray={`${(derived.assignedProducts / derived.products.length) * 100} 100`}
                        data-tip={`Linked to a supplier\n${fmt(derived.assignedProducts)} of ${fmt(derived.products.length)} products (${derived.supplierCoverage}%)`}
                        data-tip-color="var(--accent-high)"
                      />
                    )}
                    {derived.unassignedProducts > 0 && (
                      <circle
                        className="db-cov-arc is-missing"
                        cx="60"
                        cy="60"
                        r="48"
                        pathLength="100"
                        strokeDasharray={`${(derived.unassignedProducts / derived.products.length) * 100} 100`}
                        strokeDashoffset={-((derived.assignedProducts / derived.products.length) * 100)}
                        data-tip={`No supplier yet\n${fmt(derived.unassignedProducts)} of ${fmt(derived.products.length)} products (${100 - derived.supplierCoverage}%)`}
                        data-tip-color="var(--accent-low)"
                      />
                    )}
                  </svg>
                  <span className="db-cov-center" aria-hidden="true">
                    <small>Coverage</small>
                    <strong>{derived.products.length ? <CountUp value={derived.supplierCoverage} format={(n) => `${Math.round(n)}%`} /> : '—'}</strong>
                  </span>
                </div>
                <div className="db-cov-details">
                  {[
                    // Each row opens exactly what it counts.
                    { label: 'Suppliers', value: fmt(summary.supplierCount), to: { section: 'suppliers' }, tip: 'Open the Suppliers list' },
                    { label: 'Linked products', value: `${fmt(derived.assignedProducts)} of ${fmt(derived.products.length)}`, to: { section: 'products', supplierFilter: 'linked' }, tip: 'Show products that have a supplier' },
                    { label: 'Unassigned', value: fmt(derived.unassignedProducts), warn: derived.unassignedProducts > 0, to: { section: 'products', supplierFilter: 'none' }, tip: 'Show products without a supplier' },
                  ].map((row) => (
                    <button key={row.label} type="button" className="db-cov-row" onClick={() => go('Product-Supplier', row.to)} title={row.tip}>
                      <span className="db-cov-text">
                        <span className="db-cov-label">{row.label}</span>
                        <span className={`db-cov-value${row.warn ? ' is-warn' : ''}`}>{row.value}</span>
                      </span>
                      <ChevronRight size={14} aria-hidden="true" />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="category-card card">
            <button className="db-open-arrow-btn db-coverage-open-btn" onClick={() => go('Product-Supplier', { section: 'products' })} aria-label="Open products" type="button"><OpenArrow /></button>
            <div className="db-category-section">
              <div className="db-card-titles">
                <span className="db-card-title">Inventory by Category</span>
                <span className="db-card-sub">Products in each category</span>
              </div>
              <div className="db-category-metrics">
                {derived.products.length ? (
                  <div className="db-donut-row" onMouseLeave={() => setActiveCategory(null)}>
                    <svg className="db-donut-svg db-rose-svg" viewBox="-4 -4 128 128" aria-label="Inventory by category">
                      {derived.donut.map((segment) => (
                        <path
                          key={segment.name}
                          className={`db-rose-slice${activeCategory === segment.name ? ' is-active' : ''}${activeCategory && activeCategory !== segment.name ? ' is-dimmed' : ''}`}
                          d={segment.path}
                          fill={segment.color}
                          onMouseEnter={() => setActiveCategory(segment.name)}
                          data-tip={`${segment.name}\n${fmt(segment.count)} product${segment.count === 1 ? '' : 's'} · ${segment.pctLabel} of all`}
                          data-tip-color={segment.color}
                        />
                      ))}
                      {derived.donut.filter((segment) => segment.pct >= 0.06).map((segment) => (
                        <g key={`${segment.name}-tag`} className="db-rose-tag" transform={`translate(${segment.labelX} ${segment.labelY})`}>
                          <rect x="-13" y="-7" width="26" height="14" rx="7" />
                          <text x="0" y="0.4" textAnchor="middle" dominantBaseline="middle">{segment.pctLabel}</text>
                        </g>
                      ))}
                    </svg>
                    <div className="db-donut-details">
                      <strong className="db-donut-total">{fmt(derived.products.length)} products</strong>
                      <div className="db-legend db-legend-col">
                        {derived.categories.map((category) => (
                          <span
                            key={category.name}
                            className={`db-legend-item db-category-legend-item${activeCategory === category.name ? ' is-active' : ''}${activeCategory && activeCategory !== category.name ? ' is-dimmed' : ''}`}
                            style={{ '--category-color': category.color }}
                            data-tip={`${category.name}\n${fmt(category.count)} product${category.count === 1 ? '' : 's'} · ${Math.round(category.pct * 100)}% of all`}
                            data-tip-color={category.color}
                            onMouseEnter={() => setActiveCategory(category.name)}
                          >
                            <i style={{ background: category.color }} />
                            <span className="db-legend-name">{category.name}</span>
                            <span className="db-legend-count">{fmt(category.count)}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : <EmptyChart message="No products to group yet" />}
              </div>
            </div>
          </div>

          <div className="totalOrder-card card db-tone db-tone-flame">
            <div className="db-card-head"><div className="db-card-titles"><span className="db-card-title">Stock Movements</span><span className="db-card-sub">Ledger entries · last 7 days</span></div><button className="db-open-arrow-btn" onClick={() => go('Stock', { view: 'history' })} aria-label="Open Stock Control history" type="button"><OpenArrow /></button></div>
            <div className="db-stat-value">{derived.hasMovementData ? <CountUp value={derived.movementCount} /> : '—'}</div>
            {derived.hasMovementData ? (
              <div className="db-col-chart">
                {derived.dailyMovements.map((day) => (
                  <div
                    key={day.key}
                    className="db-col-item"
                    tabIndex={0}
                    aria-label={`${day.label} ${day.key}: ${day.count} ${day.count === 1 ? 'entry' : 'entries'}`}
                  >
                    <span className="db-col-bar-wrap">
                      <span className={`db-col-bar ${day.count === derived.maxMovement && derived.movementCount > 0 ? 'db-col-bar-max' : ''}`} style={{ height: `${(day.count / derived.maxMovement) * 100}%` }} />
                      {/* Shown on hover / keyboard focus, just above the bar */}
                      <span className="db-col-tip" aria-hidden="true" style={{ bottom: `calc(${(day.count / derived.maxMovement) * 100}% + 4px)` }}>
                        <span><strong>{fmt(day.count)}</strong> {day.count === 1 ? 'entry' : 'entries'}</span>
                        <small>{new Date(`${day.key}T00:00:00`).toLocaleDateString('en', { month: 'short', day: 'numeric' })}</small>
                      </span>
                    </span>
                    <span className="db-col-label">{day.label}</span>
                  </div>
                ))}
              </div>
            ) : <EmptyChart message="No movements in the last 7 days" />}
          </div>

          {/* ===== RECENT ACTIVITY: the newest stock entries and who saved them ===== */}
          <div className="activity-card card">
            <div className="db-card-head">
              <div className="db-card-titles">
                <span className="db-card-title">Recent Activity</span>
                <span className="db-card-sub">Latest stock entries</span>
              </div>
              <button className="db-open-arrow-btn" onClick={() => go('Stock', { view: 'history' })} aria-label="Open Stock Control history" type="button"><OpenArrow /></button>
            </div>
            {derived.recentActivity.length ? (
              <ul className="db-act-list db-fit-box" ref={activityBoxRef}>
                {derived.recentActivity.map((movement, index) => {
                  const person = movement.recordedBy || 'Unknown user';
                  const qty = Number(movement.qty) || 0;
                  const sign = movement.type === 'in' ? '+' : '−';
                  return (
                    <li key={movement.id} className={index >= activityFit ? 'db-fit-hidden' : undefined} aria-hidden={index >= activityFit || undefined}>
                      <button
                        type="button"
                        tabIndex={index >= activityFit ? -1 : undefined}
                        className="db-act-row"
                        onClick={() => go('Stock', movement.productId ? { highlightProductId: movement.productId } : null)}
                        data-tip={`${activityVerb(movement)} ${fmt(qty)} unit${qty === 1 ? '' : 's'}\n${movement.productName}${movement.variant ? ` · ${movement.variant}` : ''}\nBy ${person} · ${movement.date || ''}`}
                      >
                        <span className="db-act-avatar" style={{ '--avatar': colorOf(person) }} aria-hidden="true">{initialsOf(person)}</span>
                        <span className="db-act-text">
                          <span className="db-act-name">{person}</span>
                          <span className="db-act-line">
                            {activityVerb(movement)} <span className="db-act-product">{movement.productName}</span>
                          </span>
                        </span>
                        <span className="db-act-side">
                          <span className={`db-act-qty ${movement.type === 'in' ? 'is-in' : 'is-out'}`}>{sign}{fmt(qty)}</span>
                          <span className="db-act-time">{timeAgo(movement)}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : <EmptyChart message="No stock entries yet" />}
          </div>

          {/* ===== TOP PRODUCTS SOLD: photo, name, stock now, units sold ===== */}
          <div className="productSales-card card">
            <div className="db-card-head"><div className="db-card-titles"><span className="db-card-title">Top Products Sold</span><span className="db-card-sub">Last {range} months · units</span></div><button className="db-open-arrow-btn" onClick={() => go('Forecasting')} aria-label="Open sales history" type="button"><OpenArrow /></button></div>
            {derived.topProducts.length ? (
              <div className="db-ps" role="table" aria-label="Top products sold">
                <div className="db-ps-row db-ps-head" role="row">
                  <span role="columnheader">Item</span>
                  <span role="columnheader">Stock</span>
                  <span role="columnheader">Sold</span>
                </div>
                {derived.topProducts.map((product, index) => (
                  <div
                    key={product.id}
                    className="db-ps-row"
                    role="row"
                    tabIndex={0}
                    data-tip={`#${index + 1} ${product.name}\nSold: ${fmt(product.units)} units (${pct(product.units, derived.topProductsTotal)}% of the top ${derived.topProducts.length})\nIn stock now: ${product.stock == null ? '—' : fmt(product.stock)}`}
                  >
                    <span className="db-ps-item" role="cell">
                      <ProductThumb src={product.image} name={product.name} />
                      <span className="db-ps-text">
                        <span className="db-ps-name">{product.name}</span>
                        <span className="db-ps-sub">{product.category || 'No category'}</span>
                      </span>
                    </span>
                    <span className={`db-ps-num ${product.stockLevel}`} role="cell">{product.stock == null ? '—' : fmt(product.stock)}</span>
                    <span className="db-ps-num db-ps-sold" role="cell">{fmt(product.units)}</span>
                  </div>
                ))}
              </div>
            ) : <EmptyChart message="No sales recorded in this period" />}
          </div>

        </div>
      </div>
    </main>
  );
}

export default Dashboard;
