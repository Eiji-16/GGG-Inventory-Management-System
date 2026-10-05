import React, { useEffect, useMemo, useState } from 'react';
import './dashboard.css';

const fmt = (value) => Number(value || 0).toLocaleString('en-PH');
const colors = ['var(--accent)', 'var(--accent-high)', 'var(--accent-med)', 'var(--accent-low)', 'var(--text-muted)'];

function scalePoints(values, width, height, padX = 6, padTop = 10, padBottom = 8) {
  if (!values.length) return [];
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const innerWidth = width - padX * 2;
  const innerHeight = height - padTop - padBottom;
  const step = values.length > 1 ? innerWidth / (values.length - 1) : 0;

  return values.map((value, index) => [
    padX + index * step,
    padTop + innerHeight - ((value - min) / range) * innerHeight,
  ]);
}

function smoothLine(points) {
  if (points.length < 2) return '';
  let path = `M ${points[0][0]},${points[0][1]}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const previous = points[index - 1] || points[index];
    const current = points[index];
    const next = points[index + 1];
    const afterNext = points[index + 2] || next;
    path += ` C ${current[0] + (next[0] - previous[0]) / 6},${current[1] + (next[1] - previous[1]) / 6}`;
    path += ` ${next[0] - (afterNext[0] - current[0]) / 6},${next[1] - (afterNext[1] - current[1]) / 6}`;
    path += ` ${next[0]},${next[1]}`;
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

function Dashboard({ onNavigate }) {
  const [range, setRange] = useState(12);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadSummary = () => {
    setLoading(true);
    setError('');
    fetch('/api/dashboard/summary', { headers: { Accept: 'application/json' } })
      .then((response) => {
        if (!response.ok) throw new Error(`Dashboard data request failed (${response.status}).`);
        return response.json();
      })
      .then(setSummary)
      .catch((requestError) => setError(requestError.message || 'Could not load dashboard data.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadSummary();
  }, []);

  const go = (tab) => { if (onNavigate) onNavigate(tab); };
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
      threshold: Number(product.safetyStock ?? 20),
    }));
    const outOfStock = stock.filter((product) => product.quantity <= 0);
    const lowStock = stock.filter((product) => product.quantity > 0 && product.quantity <= product.threshold);
    const inStock = stock.length - outOfStock.length - lowStock.length;
    const categories = Object.entries(stock.reduce((totals, product) => {
      const category = product.category || 'Uncategorized';
      totals[category] = (totals[category] || 0) + 1;
      return totals;
    }, {})).map(([name, count], index) => ({
      name,
      count,
      pct: stock.length ? count / stock.length : 0,
      color: colors[index % colors.length],
    })).sort((a, b) => b.count - a.count);
    const topCategories = categories.slice(0, 4);
    if (categories.length > 4) {
      const otherCount = categories.slice(4).reduce((total, category) => total + category.count, 0);
      topCategories.push({ name: 'Other', count: otherCount, pct: stock.length ? otherCount / stock.length : 0, color: colors[4] });
    }
    let angle = -Math.PI / 2;
    const donut = topCategories.map((category) => {
      const sweep = category.pct * 2 * Math.PI;
      const outer = 46;
      const inner = 26;
      const point = (radius, radians) => [60 + radius * Math.cos(radians), 60 + radius * Math.sin(radians)];
      const [x1, y1] = point(outer, angle);
      const [x2, y2] = point(outer, angle + sweep);
      const [ix1, iy1] = point(inner, angle + sweep);
      const [ix2, iy2] = point(inner, angle);
      const large = sweep > Math.PI ? 1 : 0;
      const path = `M ${x1},${y1} A ${outer},${outer} 0 ${large},1 ${x2},${y2} L ${ix1},${iy1} A ${inner},${inner} 0 ${large},0 ${ix2},${iy2} Z`;
      angle += sweep;
      return { ...category, path };
    });

    const now = new Date();
    const dailyMovements = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6 + index);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      const count = stockMovements.filter((movement) => movement.date === key).length;
      return { key, count, label: date.toLocaleDateString('en', { weekday: 'short' }) };
    });
    const topProducts = Object.values(visibleSales.filter((record) => Number(record.unitsSold) > 0).reduce((totals, record) => {
      const id = record.productId || record.productName || 'Unknown product';
      if (!totals[id]) totals[id] = { name: record.productName || id, units: 0 };
      totals[id].units += Number(record.unitsSold) || 0;
      return totals;
    }, {})).sort((a, b) => b.units - a.units).slice(0, 5);
    const alerts = [
      ...outOfStock.map((product) => ({ ...product, level: 'out' })),
      ...lowStock.sort((a, b) => a.quantity - b.quantity).map((product) => ({ ...product, level: 'low' })),
    ].slice(0, 4);
    const assignedProducts = stock.filter((product) => product.supplierId).length;
    const soldProductCount = new Set(
      visibleSales.filter((record) => Number(record.unitsSold) > 0).map((record) => record.productId).filter(Boolean)
    ).size;
    const hasSalesData = monthly.some((month) => month.units > 0);
    const hasMovementData = dailyMovements.some((day) => day.count > 0);

    return {
      products: stock,
      totalStock: stock.reduce((total, product) => total + product.quantity, 0),
      inStock,
      lowStock,
      outOfStock,
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
      alerts,
      assignedProducts,
      unassignedProducts: stock.length - assignedProducts,
      supplierCoverage: stock.length ? Math.round((assignedProducts / stock.length) * 100) : 0,
      soldProductCount,
      maxCategory: Math.max(1, ...topCategories.map((category) => category.count)),
      maxProduct: Math.max(1, ...topProducts.map((product) => product.units)),
      maxMovement: Math.max(1, ...dailyMovements.map((day) => day.count)),
    };
  }, [summary, range]);

  if (loading && !summary) {
    return <main className="dashboard-content-view"><div className="dashboard-scroll-container"><p role="status">Loading live dashboard data…</p></div></main>;
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

  const heroValues = derived.monthly.map((month) => month.units);
  const heroPoints = derived.hasSalesData ? scalePoints(heroValues, 520, 150, 10, 16, 12) : [];
  const heroLine = smoothLine(heroPoints);
  const heroPeak = Math.max(0, ...heroValues);
  const supplierGauge = Arc({ cx: 60, cy: 60, radius: 46, start: 180, end: 180 + (derived.supplierCoverage / 100) * 180 });

  return (
    <main className="dashboard-content-view">
      <div className="dashboard-scroll-container">
        {error && <p role="alert">{error} Showing the last data loaded.</p>}
        <div className="parent">
          <div className="salesAnalytics-card card">
            <div className="db-card-head">
              <div className="db-card-titles">
                <span className="db-card-title">Sales History</span>
                <span className="db-card-sub">Units sold recorded by month</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div className="db-seg">
                  {[6, 12].map((months) => (
                    <button key={months} className={`db-seg-btn ${range === months ? 'active' : ''}`} onClick={() => setRange(months)}>
                      {months}M
                    </button>
                  ))}
                </div>
                <button className="db-open-arrow-btn" onClick={() => go('Forecasting')} aria-label="Open Forecasting" type="button"><OpenArrow /></button>
              </div>
            </div>
            <div className={`db-hero-plot${heroPoints.length ? '' : ' db-chart-empty-plot'}`}>
              {heroPoints.length ? (
                <svg className="db-hero-svg" viewBox="0 0 520 150" preserveAspectRatio="none" aria-label="Monthly units sold">
                  {[16, 57, 98, 138].map((y) => <line key={y} x1="0" y1={y} x2="520" y2={y} stroke="var(--hairline)" />)}
                  <path d={heroLine} fill="none" stroke="var(--accent)" strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinecap="round" />
                  {heroPoints.map(([x, y], index) => <circle key={index} cx={x} cy={y} r="3.5" fill="var(--accent)" stroke="var(--bg-card)" strokeWidth="2" vectorEffect="non-scaling-stroke" />)}
                </svg>
              ) : <EmptyChart message="No sales recorded in this period" />}
            </div>
            {heroPoints.length > 0 && <div className="db-hero-xaxis">{derived.monthly.map((month) => <span key={month.key}>{month.label}</span>)}</div>}
            <div className="db-card-foot db-hero-foot">
              <div className="db-metric"><span className="db-metric-label">Units sold</span><span className="db-metric-value">{derived.hasSalesData ? fmt(derived.unitsSold) : '—'}</span></div>
              <div className="db-metric"><span className="db-metric-label">Monthly peak</span><span className="db-metric-value">{derived.hasSalesData ? fmt(heroPeak) : '—'}</span></div>
            </div>
          </div>

          <div className="catalogStatus-card card">
            <div className="db-card-head"><div className="db-card-titles"><span className="db-card-title">Catalog Status</span></div><button className="db-open-arrow-btn" onClick={() => go('Product-Supplier')} aria-label="Open products" type="button"><OpenArrow /></button></div>
            {derived.products.length > 0 ? <>
              <div className="db-catalog-total">{fmt(derived.products.length)} <span>SKUs</span></div>
              <div className="db-stack-bar">
                <span className="db-stack-seg" style={{ width: `${(derived.inStock / derived.products.length) * 100}%`, background: 'var(--accent-high)' }} />
                <span className="db-stack-seg" style={{ width: `${(derived.lowStock.length / derived.products.length) * 100}%`, background: 'var(--accent-med)' }} />
                <span className="db-stack-seg" style={{ width: `${(derived.outOfStock.length / derived.products.length) * 100}%`, background: 'var(--accent-low)' }} />
              </div>
              <div className="db-legend">
                <span className="db-legend-item"><i style={{ background: 'var(--accent-high)' }} />In stock {fmt(derived.inStock)}</span>
                <span className="db-legend-item"><i style={{ background: 'var(--accent-med)' }} />Low {fmt(derived.lowStock.length)}</span>
                <span className="db-legend-item"><i style={{ background: 'var(--accent-low)' }} />Out {fmt(derived.outOfStock.length)}</span>
              </div>
            </> : <EmptyChart message="No products registered yet" />}
          </div>

          <div className="totalRevenue-card card">
            <div className="db-card-head"><div className="db-card-titles"><span className="db-card-title">Total Units Sold</span><span className="db-card-sub">Selected {range} months</span></div></div>
            <div className="db-stat-value">{derived.hasSalesData ? fmt(derived.unitsSold) : '—'}</div>
            <div className="db-spark-wrap"><Sparkline values={derived.hasSalesData ? heroValues : []} stroke="var(--accent-high)" gid="dbSalesGrad" /></div>
          </div>

          <div className="regionalBreakdown-card card">
            <div className="db-card-head"><div className="db-card-titles"><span className="db-card-title">Inventory by Category</span><span className="db-card-sub">Products in each category</span></div><button className="db-open-arrow-btn" onClick={() => go('Product-Supplier')} aria-label="Open products" type="button"><OpenArrow /></button></div>
            {derived.products.length ? (
              <div className="db-donut-row">
                <svg className="db-donut-svg" viewBox="0 0 120 120" aria-label="Inventory by category">
                  {derived.donut.map((segment) => <path key={segment.name} d={segment.path} fill={segment.color} opacity="0.92" />)}
                  <text x="60" y="60" className="db-donut-center-val" textAnchor="middle" dominantBaseline="middle">{fmt(derived.products.length)}</text>
                  <text x="60" y="78" className="db-donut-center-label" textAnchor="middle">products</text>
                </svg>
                <div className="db-legend db-legend-col">
                  {derived.categories.map((category) => <span key={category.name} className="db-legend-item"><i style={{ background: category.color }} />{category.name} {fmt(category.count)}</span>)}
                </div>
              </div>
            ) : <EmptyChart message="No products to group yet" />}
          </div>

          <div className="eoqActivity-card card">
            <div className="db-card-head"><div className="db-card-titles"><span className="db-card-title">Supplier Coverage</span><span className="db-card-sub">Products linked to a supplier</span></div><button className="db-open-arrow-btn" onClick={() => go('Product-Supplier')} aria-label="Open suppliers" type="button"><OpenArrow /></button></div>
            {derived.products.length > 0 ? (
              <div className="db-gauge-row">
                <svg className="db-gauge-svg" viewBox="0 0 120 74" aria-label={`${derived.supplierCoverage}% supplier coverage`}>
                  <path d={Arc({ cx: 60, cy: 60, radius: 46, start: 180, end: 360 })} fill="none" stroke="var(--static-bg-color)" strokeWidth="12" strokeLinecap="round" />
                  <path d={supplierGauge} fill="none" stroke="var(--accent-high)" strokeWidth="12" strokeLinecap="round" />
                  <text x="60" y="52" className="db-gauge-value" textAnchor="middle">{derived.supplierCoverage}%</text>
                  <text x="60" y="66" className="db-gauge-label" textAnchor="middle">covered</text>
                </svg>
                <div className="db-gauge-stats">
                  <div className="db-metric"><span className="db-metric-label">Suppliers</span><span className="db-metric-value">{fmt(summary.supplierCount)}</span></div>
                  <div className="db-metric"><span className="db-metric-label">Unassigned</span><span className="db-metric-value">{fmt(derived.unassignedProducts)}</span></div>
                </div>
              </div>
            ) : <EmptyChart message="Add products to see supplier coverage" />}
          </div>

          <div className="totalOrder-card card">
            <div className="db-card-head"><div className="db-card-titles"><span className="db-card-title">Stock Movements</span><span className="db-card-sub">Ledger entries · last 7 days</span></div><button className="db-open-arrow-btn" onClick={() => go('Stock')} aria-label="Open Stock Control" type="button"><OpenArrow /></button></div>
            <div className="db-stat-value">{derived.hasMovementData ? fmt(derived.movementCount) : '—'}</div>
            {derived.hasMovementData ? (
              <div className="db-col-chart">
                {derived.dailyMovements.map((day) => (
                  <div key={day.key} className="db-col-item">
                    <span className="db-col-bar-wrap"><span className={`db-col-bar ${day.count === derived.maxMovement && derived.movementCount > 0 ? 'db-col-bar-max' : ''}`} style={{ height: `${(day.count / derived.maxMovement) * 100}%` }} /></span>
                    <span className="db-col-label">{day.label}</span>
                  </div>
                ))}
              </div>
            ) : <EmptyChart message="No movements in the last 7 days" />}
          </div>

          <div className="productSales-card card">
            <div className="db-card-head"><div className="db-card-titles"><span className="db-card-title">Top Products Sold</span><span className="db-card-sub">Selected {range} months · units</span></div><button className="db-open-arrow-btn" onClick={() => go('Forecasting')} aria-label="Open sales history" type="button"><OpenArrow /></button></div>
            {derived.topProducts.length ? (
              <div className="db-rank">{derived.topProducts.map((product) => (
                <div key={product.name} className="db-rank-row">
                  <span className="db-rank-name">{product.name}</span>
                  <span className="db-rank-track"><span className="db-rank-fill" style={{ width: `${(product.units / derived.maxProduct) * 100}%` }} /></span>
                  <span className="db-rank-val">{fmt(product.units)}</span>
                </div>
              ))}</div>
            ) : <EmptyChart message="No sales recorded in this period" />}
          </div>

          <div className="lowStockalerts-card card">
            <div className="db-card-head"><div className="db-card-titles"><span className="db-card-title">Stock Alerts</span><span className="db-card-sub">{derived.outOfStock.length + derived.lowStock.length} products at or below reorder level</span></div><button className="db-open-arrow-btn" onClick={() => go('Stock')} aria-label="Open Stock Control" type="button"><OpenArrow /></button></div>
            <div className="db-stack-bar db-stack-bar-sm">
              {(derived.outOfStock.length + derived.lowStock.length) > 0 && <>
                <span className="db-stack-seg" style={{ width: `${(derived.outOfStock.length / (derived.outOfStock.length + derived.lowStock.length)) * 100}%`, background: 'var(--accent-low)' }} />
                <span className="db-stack-seg" style={{ width: `${(derived.lowStock.length / (derived.outOfStock.length + derived.lowStock.length)) * 100}%`, background: 'var(--accent-med)' }} />
              </>}
            </div>
            <div className="db-alert-list">
              {derived.alerts.length ? derived.alerts.map((product) => (
                <div key={product.id} className={`db-alert-row db-alert-${product.level}`}>
                  <span className="db-alert-dot" /><span className="db-alert-name">{product.name}</span>
                  <span className="db-alert-qty">{product.level === 'out' ? 'Out of stock' : `${fmt(product.quantity)} left`}</span>
                </div>
              )) : <span className="db-card-sub">No products need attention.</span>}
            </div>
          </div>

          <div className="totalCustomer-card card">
            <div className="db-card-head"><div className="db-card-titles"><span className="db-card-title">Products with Sales</span><span className="db-card-sub">Distinct products in recorded history</span></div></div>
            <div className="db-stat-value">{derived.hasSalesData ? fmt(derived.soldProductCount) : '—'}</div>
            <div className="db-stat-sub">{derived.hasSalesData ? `${fmt(derived.salesRecordCount)} monthly product records in selected range` : 'No sales history recorded in this period'}</div>
            <div className="db-spark-wrap"><Sparkline values={derived.hasSalesData ? derived.monthly.map((month) => month.records) : []} stroke="var(--accent)" gid="dbHistoryGrad" /></div>
          </div>

          <div className="totalStaff-card card">
            <div className="db-card-head"><div className="db-card-titles"><span className="db-card-title">User Accounts</span><span className="db-card-sub">Accounts registered in the system</span></div><button className="db-open-arrow-btn" onClick={() => go('Staffs')} aria-label="Open Staffs" type="button"><OpenArrow /></button></div>
            <div className="db-stat-value">{fmt(summary.userCount)}</div>
            <div className="db-stat-sub">Role breakdown is not available in the current data.</div>
          </div>
        </div>
      </div>
    </main>
  );
}

export default Dashboard;
