import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Package, Boxes, ShieldCheck, ShoppingBag, TrendingUp, TrendingDown, Minus, ArrowUpRight } from 'lucide-react';
import './dashboard.css';
import { statusPointsFor } from '../../data/safetyStock';

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

/* A round axis top just above the peak (e.g. 276 → 300), so axis labels read cleanly. */
function niceCeil(value) {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((s) => s * magnitude >= value);
  return step * magnitude;
}

/* Smooth line through the points that never overshoots them (monotone
   cubic), so a curve can't dip below zero or above the peak between months. */
function smoothLine(points) {
  if (points.length < 2) return '';
  const n = points.length;
  const dx = [];
  const slope = [];
  for (let i = 0; i < n - 1; i += 1) {
    dx[i] = points[i + 1][0] - points[i][0];
    slope[i] = dx[i] ? (points[i + 1][1] - points[i][1]) / dx[i] : 0;
  }
  const tangent = [slope[0]];
  for (let i = 1; i < n - 1; i += 1) {
    tangent[i] = slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2;
  }
  tangent[n - 1] = slope[n - 2];
  for (let i = 0; i < n - 1; i += 1) {
    if (slope[i] === 0) {
      tangent[i] = 0;
      tangent[i + 1] = 0;
    } else {
      const a = tangent[i] / slope[i];
      const b = tangent[i + 1] / slope[i];
      const h = a * a + b * b;
      if (h > 9) {
        const t = 3 / Math.sqrt(h);
        tangent[i] = t * a * slope[i];
        tangent[i + 1] = t * b * slope[i];
      }
    }
  }
  let path = `M ${points[0][0]},${points[0][1]}`;
  for (let i = 0; i < n - 1; i += 1) {
    const third = dx[i] / 3;
    path += ` C ${points[i][0] + third},${points[i][1] + tangent[i] * third}`;
    path += ` ${points[i + 1][0] - third},${points[i + 1][1] - tangent[i + 1] * third}`;
    path += ` ${points[i + 1][0]},${points[i + 1][1]}`;
  }
  return path;
}

function Sparkline({ values, stroke, gid }) {
  if (values.length < 2 || values.every((value) => value === 0)) {
    return <EmptyChart message="No chart data yet" />;
  }
  const width = 120;
  const height = 40;
  const points = scalePoints(values, width, height, 3, 5, 5);
  const line = smoothLine(points);
  const area = `${line} L ${points[points.length - 1][0]},${height} L ${points[0][0]},${height} Z`;

  return (
    <svg className="db-spark-svg" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.35" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={stroke} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinecap="round" />
    </svg>
  );
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

function Arc({ cx, cy, radius, start, end }) {
  const point = (degrees) => {
    const angle = (degrees * Math.PI) / 180;
    return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)];
  };
  const [x1, y1] = point(start);
  const [x2, y2] = point(end);
  return `M ${x1} ${y1} A ${radius} ${radius} 0 ${end - start > 180 ? 1 : 0} 1 ${x2} ${y2}`;
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
  const [range, setRange] = useState(12);
  const [activeCategory, setActiveCategory] = useState(null);
  const [hoveredSalesMonth, setHoveredSalesMonth] = useState(null);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const summaryRequestRef = useRef(0);

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
      .slice(0, 5);
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
  const heroValues = derived.monthly.map((month) => month.units);
  const heroPeak = Math.max(0, ...heroValues);
  // Zero-based axis: the height of each point is its real share of the axis top.
  const heroTop = niceCeil(heroPeak);
  const heroPoints = derived.hasSalesData ? scalePoints(heroValues, 520, 150, 10, 16, 12, { min: 0, max: heroTop }) : [];
  // Trend line: straight segments between months (shows each change honestly).
  const heroLine = heroPoints.map(([x, y], index) => `${index ? 'L' : 'M'} ${x},${y}`).join(' ');
  const heroStep = heroPoints.length > 1 ? heroPoints[1][0] - heroPoints[0][0] : 520;
  const monthTitle = (key) => {
    const [y, m] = String(key).split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString('en', { month: 'long', year: 'numeric' });
  };
  const heroTicks = [1, 2 / 3, 1 / 3, 0].map((share) => ({ value: Math.round(heroTop * share), y: 138 - share * 122 }));
  const monthsWithSales = derived.monthly.filter((month) => month.units > 0).length;
  const heroAverage = monthsWithSales ? Math.round(derived.unitsSold / derived.monthly.length) : 0;
  const supplierGauge = Arc({ cx: 60, cy: 60, radius: 46, start: 180, end: 180 + (derived.supplierCoverage / 100) * 180 });

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
            value={fmt(kpi.total)}
            unit={kpi.total === 1 ? 'product' : 'products'}
            onClick={() => go('Product-Supplier')}
            openLabel="Open Product & Supplier"
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
            value={fmt(derived.totalStock)}
            unit="units"
            onClick={() => go('Stock')}
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
            value={kpi.healthyPct == null ? '—' : `${kpi.healthyPct}%`}
            unit={kpi.healthyPct == null ? '' : 'in stock'}
            onClick={() => go('Reorder-Alerts')}
            openLabel="Open Reorder List"
          >
            {kpi.total ? (
              <>
                <span className="db-kpi-bar" aria-hidden="true">
                  {[['is-good', derived.health.in], ['is-warn', derived.health.low], ['is-crit', derived.health.critical], ['is-bad', derived.health.out]]
                    .filter(([, count]) => count > 0)
                    .map(([level, count]) => (
                      <span key={level} className={`db-kpi-bar-seg ${level}`} style={{ width: `${(count / kpi.total) * 100}%` }} />
                    ))}
                </span>
                <span className="db-kpi-legend">
                  <span><i className="is-good" />{fmt(derived.health.in)} in stock</span>
                  <span><i className="is-warn" />{fmt(derived.health.low)} low</span>
                  <span><i className="is-crit" />{fmt(derived.health.critical)} critical</span>
                  <span><i className="is-bad" />{fmt(derived.health.out)} out</span>
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
            value={fmt(kpi.soldThisMonth)}
            unit="units"
            onClick={() => go('Forecasting')}
            openLabel="Open Forecasting"
          >
            {kpi.shareOfLastMonth != null ? (
              <>
                <span className="db-kpi-progress" aria-hidden="true">
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
          <div className="salesAnalytics-card card">
            <div className="db-card-head">
              <div className="db-card-titles">
                <span className="db-card-title">Sales History</span>
                <span className="db-card-sub">Track units sold by month to spot seasonal trends</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div className="db-seg">
                  {[6, 12].map((months) => (
                    <button key={months} className={`db-seg-btn ${range === months ? 'active' : ''}`} onClick={() => { setRange(months); setHoveredSalesMonth(null); }}>
                      {months}M
                    </button>
                  ))}
                </div>
                <button className="db-open-arrow-btn" onClick={() => go('Forecasting')} aria-label="Open Forecasting" type="button"><OpenArrow /></button>
              </div>
            </div>
            {/* Total for the selected range, with an accent bar (trend-overview style). */}
            <div className="db-trend-total">
              <span className="db-trend-total-label">Total units sold · last {range} months</span>
              <strong>{derived.hasSalesData ? fmt(derived.unitsSold) : '—'}</strong>
            </div>
            <div className={`db-hero-plot db-trend-plot${heroPoints.length ? '' : ' db-chart-empty-plot'}`}>
              {heroPoints.length ? (
                <>
                  <div className="db-hero-yaxis" aria-hidden="true">
                    {heroTicks.map((tick) => (
                      <span key={tick.y} style={{ top: `${(tick.y / 150) * 100}%` }}>{fmt(tick.value)}</span>
                    ))}
                  </div>
                  <svg className="db-hero-svg" viewBox="0 0 520 150" preserveAspectRatio="none" aria-label="Monthly units sold">
                    {heroTicks.map((tick) => <line key={tick.y} x1="0" y1={tick.y} x2="520" y2={tick.y} stroke="var(--hairline)" vectorEffect="non-scaling-stroke" />)}
                    {hoveredSalesMonth !== null && heroPoints[hoveredSalesMonth] && (
                      <line className="db-trend-guide" x1={heroPoints[hoveredSalesMonth][0]} y1={heroPoints[hoveredSalesMonth][1]} x2={heroPoints[hoveredSalesMonth][0]} y2="138" vectorEffect="non-scaling-stroke" />
                    )}
                    <path d={heroLine} fill="none" stroke="var(--accent)" strokeWidth="1.8" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
                    {heroPoints.map(([x], index) => (
                      <rect
                        key={derived.monthly[index].key}
                        className="db-hero-point db-trend-hit"
                        x={x - heroStep / 2}
                        y="0"
                        width={heroStep}
                        height="150"
                        tabIndex={0}
                        role="img"
                        aria-label={`${monthTitle(derived.monthly[index].key)}: ${fmt(derived.monthly[index].units)} units sold`}
                        onMouseEnter={() => setHoveredSalesMonth(index)}
                        onMouseLeave={() => setHoveredSalesMonth(null)}
                        onFocus={() => setHoveredSalesMonth(index)}
                        onBlur={() => setHoveredSalesMonth(null)}
                      />
                    ))}
                  </svg>
                  {hoveredSalesMonth !== null && derived.monthly[hoveredSalesMonth] && (
                    <>
                      <span
                        className="db-trend-dot"
                        style={{
                          // Same place as the point on the line: the line is drawn after
                          // the y-axis labels (--plot-pad), so add that offset.
                          left: `calc(var(--plot-pad, 0px) + (100% - var(--plot-pad, 0px)) * ${heroPoints[hoveredSalesMonth][0] / 520})`,
                          top: `${(heroPoints[hoveredSalesMonth][1] / 150) * 100}%`,
                        }}
                        aria-hidden="true"
                      />
                      <div
                        className={`db-hero-tooltip db-trend-tag${heroPoints[hoveredSalesMonth][0] > 390 ? ' db-hero-tooltip-left' : ''}`}
                        style={{
                          // Same place as the point on the line: the line is drawn after
                          // the y-axis labels (--plot-pad), so add that offset.
                          left: `calc(var(--plot-pad, 0px) + (100% - var(--plot-pad, 0px)) * ${heroPoints[hoveredSalesMonth][0] / 520})`,
                          top: `${(heroPoints[hoveredSalesMonth][1] / 150) * 100}%`,
                        }}
                        role="status"
                        aria-live="polite"
                      >
                        <strong>{fmt(derived.monthly[hoveredSalesMonth].units)}</strong>
                        <span>units sold in {monthTitle(derived.monthly[hoveredSalesMonth].key)}</span>
                      </div>
                    </>
                  )}
                </>
              ) : <EmptyChart message="No sales recorded in this period" />}
            </div>
            {heroPoints.length > 0 && <div className="db-hero-xaxis">{derived.monthly.map((month) => <span key={month.key}>{month.label}</span>)}</div>}
            <div className="db-card-foot db-hero-foot">
              <div className="db-metric"><span className="db-metric-label">Monthly peak</span><span className="db-metric-value">{derived.hasSalesData ? fmt(heroPeak) : '—'}</span></div>
              <div className="db-metric"><span className="db-metric-label">Avg / month</span><span className="db-metric-value">{derived.hasSalesData ? fmt(heroAverage) : '—'}</span></div>
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
              <div className="db-order-list">
                {summary.reorderSuggestions.slice(0, LIST_LIMIT).map((item) => {
                  const tag = reorderTag(item);
                  return (
                    <button
                      key={item.productId}
                      type="button"
                      className={`db-order-row is-${tag.level}`}
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
                {summary.reorderSuggestions.length > LIST_LIMIT && (
                  <button type="button" className="db-list-more" onClick={() => go('Reorder-Alerts')}>
                    View all {fmt(summary.reorderSuggestions.length)} in the Reorder List →
                  </button>
                )}
              </div>
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
            <button className="db-open-arrow-btn db-coverage-open-btn" onClick={() => go('Product-Supplier')} aria-label="Open suppliers" type="button"><OpenArrow /></button>
            <div className="db-coverage-section">
              <div className="db-card-titles">
                <span className="db-card-title">Supplier Coverage</span>
                <span className="db-card-sub">Products linked to a supplier</span>
              </div>
              <div className="db-coverage-metrics">
                <div className="db-gauge-row db-coverage-row">
                  <svg className="db-gauge-svg db-coverage-svg" viewBox="0 0 120 74" aria-label={`${derived.supplierCoverage}% supplier coverage`}>
                    <path d={Arc({ cx: 60, cy: 60, radius: 46, start: 180, end: 360 })} fill="none" stroke="var(--static-bg-color)" strokeWidth="12" strokeLinecap="round" />
                    <path d={supplierGauge} fill="none" stroke="var(--accent-high)" strokeWidth="12" strokeLinecap="round" />
                    <text x="60" y="52" className="db-gauge-value db-coverage-value" textAnchor="middle">{derived.supplierCoverage}%</text>
                    <text x="60" y="66" className="db-gauge-label db-coverage-label" textAnchor="middle">covered</text>
                  </svg>
                  <div className="db-gauge-stats db-coverage-stats">
                    <div className="db-metric"><span className="db-metric-label">Suppliers</span><span className="db-metric-value">{fmt(summary.supplierCount)}</span></div>
                    <div className="db-metric"><span className="db-metric-label">Unassigned</span><span className="db-metric-value">{fmt(derived.unassignedProducts)}</span></div>
                  </div>
                </div>
                {derived.products.length === 0 && <span className="db-coverage-empty">No products assigned yet</span>}
              </div>
            </div>
          </div>

          <div className="category-card card">
            <button className="db-open-arrow-btn db-coverage-open-btn" onClick={() => go('Product-Supplier')} aria-label="Open products" type="button"><OpenArrow /></button>
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
                        >
                          <title>{`${segment.name}: ${fmt(segment.count)} (${segment.pctLabel})`}</title>
                        </path>
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
                            title={`${category.name}: ${fmt(category.count)}`}
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
            <div className="db-card-head"><div className="db-card-titles"><span className="db-card-title">Stock Movements</span><span className="db-card-sub">Ledger entries · last 7 days</span></div><button className="db-open-arrow-btn" onClick={() => go('Stock')} aria-label="Open Stock Control" type="button"><OpenArrow /></button></div>
            <div className="db-stat-value">{derived.hasMovementData ? fmt(derived.movementCount) : '—'}</div>
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

          <div className="productSales-card card">
            <div className="db-card-head"><div className="db-card-titles"><span className="db-card-title">Top Products Sold</span><span className="db-card-sub">Selected {range} months · units</span></div><button className="db-open-arrow-btn" onClick={() => go('Forecasting')} aria-label="Open sales history" type="button"><OpenArrow /></button></div>
            {derived.topProducts.length ? (
              <div className="db-rank" tabIndex={0} aria-label="Top products sold">{derived.topProducts.map((product) => (
                <div key={product.id} className="db-rank-row">
                  <span className="db-rank-name">{product.name}</span>
                  <span className="db-rank-track"><span className="db-rank-fill" style={{ width: `${(product.units / derived.maxProduct) * 100}%` }} /></span>
                  <span className="db-rank-val">{fmt(product.units)}</span>
                </div>
              ))}</div>
            ) : <EmptyChart message="No sales recorded in this period" />}
          </div>


        </div>
      </div>
    </main>
  );
}

export default Dashboard;
