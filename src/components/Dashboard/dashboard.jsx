import React, { useState } from 'react';
import './dashboard.css';

/*==========SAMPLE DATA==========*/
/* Placeholder figures for a watch/timepiece store. Replaced by API data once the backend is wired. */

const SALES = {
  Week:  { labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], values: [42, 55, 47, 63, 72, 90, 81], delta: 12.4 },
  Month: { labels: ['1', '5', '10', '15', '20', '25', '30'],           values: [210, 260, 240, 300, 330, 360, 410], delta: 8.1 },
  Year:  { labels: ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'], values: [820, 760, 910, 880, 1020, 1150, 1080, 1240, 1190, 1320, 1450, 1610], delta: 23.6 },
};

const REGIONS = [
  { name: 'NCR',      pct: 0.38, color: 'var(--accent)' },
  { name: 'Luzon',    pct: 0.24, color: 'var(--accent-high)' },
  { name: 'Visayas',  pct: 0.18, color: 'var(--accent-med)' },
  { name: 'Mindanao', pct: 0.13, color: 'var(--accent-low)' },
  { name: 'Intl',     pct: 0.07, color: 'var(--text-muted)' },
];

const CATALOG = { total: 2148, inStock: 1806, low: 262, out: 80 };

const REVENUE = { value: 1284500, delta: 18.2, spark: [52, 58, 55, 63, 60, 71, 68, 79, 86] };

const ORDERS = { value: 3472, delta: 6.4, labels: ['M', 'T', 'W', 'T', 'F', 'S', 'S'], bars: [38, 52, 44, 61, 49, 72, 80] };

const TOP_PRODUCTS = [
  { name: 'Chrono Steel 42',   units: 328 },
  { name: 'Classic Rose Gold', units: 274 },
  { name: 'Diver Pro 300m',    units: 231 },
  { name: 'Minimalist 36',     units: 198 },
  { name: 'Skeleton Auto',     units: 156 },
];

const ALERTS = [
  { name: 'Diver Pro 300m',    level: 'out',     qty: 0 },
  { name: 'Chrono Steel 42',   level: 'low',     qty: 6 },
  { name: 'Pilot 44 Bronze',   level: 'low',     qty: 9 },
  { name: 'Classic Rose Gold', level: 'reorder', qty: 14 },
];
const ALERT_SUMMARY = { out: 8, low: 23, reorder: 41 };

const CUSTOMERS = { value: 1946, delta: 4.7, spark: [120, 135, 128, 150, 162, 158, 175, 188, 201] };

const EOQ = { rate: 0.82, calcsThisWeek: 37, avgOrderQty: 145 };

/*==========CHART MATH HELPERS==========*/
const fmt = (n) => n.toLocaleString('en-PH');

function scalePoints(values, w, h, padX = 6, padTop = 10, padBottom = 8) {
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = (max - min) || 1;
  const innerW = w - padX * 2;
  const innerH = h - padTop - padBottom;
  const step = values.length > 1 ? innerW / (values.length - 1) : 0;
  return values.map((v, i) => {
    const x = padX + i * step;
    const y = padTop + innerH - ((v - min) / range) * innerH;
    return [x, y];
  });
}

/* Catmull-Rom -> cubic bezier for smooth curves */
function smoothLine(pts) {
  if (pts.length < 2) return '';
  let d = `M ${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
    const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
    const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
    const cp2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2[0]},${p2[1]}`;
  }
  return d;
}

function arcPath(cx, cy, r, startDeg, endDeg) {
  const pt = (deg) => {
    const a = (deg * Math.PI) / 180;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  };
  const [x1, y1] = pt(startDeg);
  const [x2, y2] = pt(endDeg);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
}

/*==========SPARKLINE (reused mini area chart)==========*/
function Sparkline({ values, stroke = 'var(--accent)', gid }) {
  const W = 120, H = 40;
  const pts = scalePoints(values, W, H, 3, 5, 5);
  const line = smoothLine(pts);
  const area = `${line} L ${pts[pts.length - 1][0]},${H} L ${pts[0][0]},${H} Z`;
  return (
    <svg className="db-spark-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.35" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} stroke="none" />
      <path d={line} fill="none" stroke={stroke} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/*==========DELTA PILL==========*/
function Delta({ value }) {
  const up = value >= 0;
  return (
    <span className={`db-delta ${up ? 'db-delta-up' : 'db-delta-down'}`}>
      {up ? '▲' : '▼'} {Math.abs(value)}%
    </span>
  );
}

/*==========OPEN AFFORDANCE ARROW==========*/
const OpenArrow = () => (
  <svg className="db-open-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M7 17L17 7" /><path d="M8 7h9v9" />
  </svg>
);

function Dashboard({ onNavigate }) {
  const [range, setRange] = useState('Week');

  const go = (tab) => { if (onNavigate) onNavigate(tab); };
  const cardNav = (tab) => ({
    className: 'card db-clickable',
    role: 'button',
    tabIndex: 0,
    onClick: () => go(tab),
    onKeyDown: (e) => {
      if (e.target !== e.currentTarget) return;
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(tab); }
    },
  });

  /*==========HERO (SALES ANALYTICS) COMPUTED==========*/
  const s = SALES[range];
  const HERO_W = 520, HERO_H = 150;
  const heroPts = scalePoints(s.values, HERO_W, HERO_H, 10, 16, 12);
  const heroLine = smoothLine(heroPts);
  const heroArea = `${heroLine} L ${heroPts[heroPts.length - 1][0]},${HERO_H - 6} L ${heroPts[0][0]},${HERO_H - 6} Z`;
  const heroTotal = s.values.reduce((a, b) => a + b, 0);
  const heroPeak = Math.max(...s.values);
  const gridYs = [0, 1, 2, 3].map((i) => 16 + ((HERO_H - 28) * i) / 3);

  /*==========REGIONAL (FLAT MAP) COMPUTED==========*/
  const domesticPct = REGIONS.filter((r) => r.name !== 'Intl').reduce((a, s) => a + s.pct, 0);
  /* PH dot: lon=122, lat=12 → x=(122+180)/360*1000=838, y=(90-12)/180*500=217 */
  const phDot = [838, 217];

  /*==========GAUGE (EOQ) COMPUTED==========*/
  const GX = 60, GY = 60, GR = 46;
  const gaugeTrack = arcPath(GX, GY, GR, 180, 360);
  const gaugeValue = arcPath(GX, GY, GR, 180, 180 + EOQ.rate * 180);

  const catMax = CATALOG.total;
  const orderMax = Math.max(...ORDERS.bars);
  const prodMax = Math.max(...TOP_PRODUCTS.map((p) => p.units));
  const alertTotal = ALERT_SUMMARY.out + ALERT_SUMMARY.low + ALERT_SUMMARY.reorder;

  return (
    <main className="dashboard-content-view">
      <div className="dashboard-scroll-container">
        <div className="parent">

          {/* Sales Analytics */}
          <div className="salesAnalytics-card card">
            <div className="db-card-head">
              <div className="db-card-titles">
                <span className="db-card-title">Sales Analytics</span>
                <span className="db-card-sub">Revenue trend · view in Reports</span>
              </div>
              <div style={{display:'flex',alignItems:'center',gap:'6px'}}>
                <div className="db-seg">
                  {['Week', 'Month', 'Year'].map((r) => (
                    <button
                      key={r}
                      className={`db-seg-btn ${range === r ? 'active' : ''}`}
                      onClick={(e) => { e.stopPropagation(); setRange(r); }}
                    >
                      {r}
                    </button>
                  ))}
                </div>
                <button className="db-open-arrow-btn" onClick={() => go('Reports')} aria-label="Open in Reports" type="button"><OpenArrow /></button>
              </div>
            </div>

            <div className="db-hero-plot">
              <svg className="db-hero-svg" viewBox={`0 0 ${HERO_W} ${HERO_H}`} preserveAspectRatio="none" aria-hidden="true">
                <defs>
                  <linearGradient id="dbHeroGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.32" />
                    <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
                  </linearGradient>
                </defs>
                {gridYs.map((y, i) => (
                  <line key={i} x1="0" y1={y} x2={HERO_W} y2={y} stroke="var(--hairline)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
                ))}
                <path d={heroArea} fill="url(#dbHeroGrad)" stroke="none" />
                <path d={heroLine} fill="none" stroke="var(--accent)" strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div className="db-hero-xaxis">
              {s.labels.map((l, i) => <span key={i}>{l}</span>)}
            </div>

            <div className="db-card-foot db-hero-foot">
              <div className="db-metric">
                <span className="db-metric-label">Total</span>
                <span className="db-metric-value">₱{fmt(heroTotal)}K</span>
              </div>
              <div className="db-metric">
                <span className="db-metric-label">Peak</span>
                <span className="db-metric-value">₱{fmt(heroPeak)}K</span>
              </div>
              <div className="db-metric">
                <span className="db-metric-label">vs prev</span>
                <span className="db-metric-value"><Delta value={s.delta} /></span>
              </div>
              <OpenArrow />
            </div>
          </div>

          {/* Catalog Status */}
          <div className="catalogStatus-card card">
            <div className="db-card-head">
              <div className="db-card-titles">
                <span className="db-card-title">Catalog Status</span>
              </div>
              <button className="db-open-arrow-btn" onClick={() => go('Product-Supplier')} aria-label="Open in Product-Supplier" type="button"><OpenArrow /></button>
            </div>
            <div className="db-catalog-total">{fmt(CATALOG.total)} <span>SKUs</span></div>
            <div className="db-stack-bar">
              <span className="db-stack-seg" style={{ width: `${(CATALOG.inStock / catMax) * 100}%`, background: 'var(--accent-high)' }} />
              <span className="db-stack-seg" style={{ width: `${(CATALOG.low / catMax) * 100}%`, background: 'var(--accent-med)' }} />
              <span className="db-stack-seg" style={{ width: `${(CATALOG.out / catMax) * 100}%`, background: 'var(--accent-low)' }} />
            </div>
            <div className="db-legend">
              <span className="db-legend-item"><i style={{ background: 'var(--accent-high)' }} />In {fmt(CATALOG.inStock)}</span>
              <span className="db-legend-item"><i style={{ background: 'var(--accent-med)' }} />Low {fmt(CATALOG.low)}</span>
              <span className="db-legend-item"><i style={{ background: 'var(--accent-low)' }} />Out {fmt(CATALOG.out)}</span>
            </div>
          </div>

          {/* Total Revenue */}
          <div className="totalRevenue-card card">
            <div className="db-card-head">
              <div className="db-card-titles">
                <span className="db-card-title">Total Revenue</span>
              </div>
              <Delta value={REVENUE.delta} />
            </div>
            <div className="db-stat-value">₱{(REVENUE.value / 1e6).toFixed(2)}M</div>
            <div className="db-spark-wrap">
              <Sparkline values={REVENUE.spark} stroke="var(--accent-high)" gid="dbRevGrad" />
            </div>
          </div>

          {/* Regional Breakdown — orthographic globe */}
          {/* Regional Breakdown - flat world map */}
          <div className="regionalBreakdown-card card">
            <div className="db-card-head">
              <div className="db-card-titles">
                <span className="db-card-title">Regional Breakdown</span>
                <span className="db-card-sub">Geography-based sales</span>
              </div>
              <button className="db-open-arrow-btn" onClick={() => go('Reports')} aria-label="Open in Reports" type="button"><OpenArrow /></button>
            </div>
            <div className="db-map-wrap">
              <svg className="db-map-svg" viewBox="0 0 1000 500" preserveAspectRatio="xMidYMid meet" aria-label={`Philippines ${Math.round(domesticPct * 100)}% of sales`}>
                {/* continents — hand-drawn pixel paths */}
                <g fill="var(--text-muted)" fillOpacity="0.28" stroke="var(--bg-card)" strokeWidth="2" strokeLinejoin="round">
                  {/* Greenland */}
                  <path d="M 200,18 L 222,14 L 248,16 L 262,26 L 268,40 L 260,56 L 244,64 L 224,60 L 208,48 L 198,34 Z" />
                  {/* North America */}
                  <path d="M 108,68 L 138,58 L 172,54 L 200,60 L 222,72 L 238,88 L 244,106 L 240,126 L 228,144 L 218,160 L 210,178 L 198,196 L 188,212 L 178,228 L 172,240 L 162,248 L 150,250 L 140,244 L 132,232 L 122,220 L 112,206 L 104,190 L 96,174 L 90,156 L 86,138 L 84,120 L 86,102 L 92,86 Z" />
                  {/* Central America */}
                  <path d="M 150,250 L 162,248 L 170,256 L 172,266 L 166,272 L 158,268 L 152,260 Z" />
                  {/* South America */}
                  <path d="M 180,272 L 200,262 L 222,258 L 244,264 L 260,278 L 268,298 L 270,320 L 264,344 L 252,366 L 236,386 L 218,402 L 200,412 L 184,408 L 172,394 L 164,374 L 160,350 L 160,326 L 164,304 L 172,286 Z" />
                  {/* Europe */}
                  <path d="M 448,60 L 468,56 L 490,58 L 504,68 L 506,82 L 498,94 L 484,100 L 470,98 L 456,90 L 446,78 Z" />
                  {/* Scandinavia */}
                  <path d="M 472,38 L 488,32 L 500,38 L 502,52 L 492,60 L 478,58 L 468,50 Z" />
                  {/* Africa */}
                  <path d="M 452,140 L 476,132 L 502,130 L 524,136 L 540,152 L 548,172 L 548,196 L 542,222 L 530,248 L 514,272 L 496,294 L 478,308 L 460,310 L 444,300 L 432,280 L 426,256 L 424,230 L 426,204 L 432,180 L 440,160 Z" />
                  {/* Asia main */}
                  <path d="M 510,56 L 548,48 L 590,44 L 636,46 L 678,50 L 714,58 L 742,68 L 760,82 L 766,98 L 758,114 L 740,126 L 716,132 L 688,134 L 658,130 L 628,122 L 598,114 L 570,108 L 546,104 L 526,100 L 514,90 L 508,76 Z" />
                  {/* Middle East */}
                  <path d="M 528,136 L 554,128 L 578,132 L 592,148 L 590,166 L 574,176 L 554,172 L 538,160 L 528,148 Z" />
                  {/* India */}
                  <path d="M 604,148 L 626,142 L 644,150 L 650,168 L 648,190 L 638,210 L 622,226 L 608,224 L 598,208 L 594,188 L 596,168 Z" />
                  {/* Southeast Asia */}
                  <path d="M 686,160 L 710,154 L 730,162 L 738,178 L 732,194 L 714,202 L 694,198 L 680,184 L 678,170 Z" />
                  {/* Japan */}
                  <path d="M 780,90 L 794,84 L 804,90 L 806,104 L 798,114 L 784,112 L 776,102 Z" />
                  {/* Indonesia */}
                  <path d="M 716,234 L 738,228 L 758,232 L 770,244 L 764,256 L 744,260 L 722,254 L 710,244 Z" />
                  {/* Australia */}
                  <path d="M 780,300 L 820,288 L 860,290 L 892,304 L 908,324 L 908,350 L 894,372 L 870,386 L 840,390 L 810,382 L 784,364 L 768,340 L 764,316 Z" />
                  {/* New Zealand */}
                  <path d="M 920,360 L 932,354 L 940,362 L 936,374 L 924,376 L 916,368 Z" />
                </g>
                {/* Philippines highlighted */}
                <g fill="var(--accent-high)" fillOpacity="0.9" stroke="var(--bg-card)" strokeWidth="1.5">
                  <path d="M 828,196 L 838,190 L 848,196 L 850,210 L 842,218 L 830,216 L 824,206 Z" />
                  <path d="M 834,220 L 846,216 L 854,224 L 852,236 L 842,240 L 832,234 Z" />
                  <path d="M 826,238 L 838,234 L 848,242 L 846,252 L 836,256 L 824,248 Z" />
                </g>
                {/* pulse dot */}
                <circle cx={phDot[0]} cy={phDot[1]} r="7" fill="var(--accent-high)" opacity="0.95" />
                <circle className="db-globe-pulse" cx={phDot[0]} cy={phDot[1]} r="14" fill="none" stroke="var(--accent-high)" strokeWidth="2" />
              </svg>
              <span className="db-globe-cap"><i />PH {Math.round(domesticPct * 100)}% of sales</span>
            </div>
            <div className="db-legend db-legend-col" style={{marginTop:'4px'}}>
              {REGIONS.map((seg, i) => (
                <span key={i} className="db-legend-item"><i style={{ background: seg.color }} />{seg.name} {Math.round(seg.pct * 100)}%</span>
              ))}
            </div>
          </div>

          {/* EOQ Activity */}
          <div className="eoqActivity-card card">
            <div className="db-card-head">
              <div className="db-card-titles">
                <span className="db-card-title">EOQ Activity</span>
                <span className="db-card-sub">Order optimization</span>
              </div>
              <button className="db-open-arrow-btn" onClick={() => go('Auto-Calculator')} aria-label="Open in Auto-Calculator" type="button"><OpenArrow /></button>
            </div>
            <div className="db-gauge-row">
              <svg className="db-gauge-svg" viewBox="0 0 120 74" aria-hidden="true">
                <path d={gaugeTrack} fill="none" stroke="var(--static-bg-color)" strokeWidth="12" strokeLinecap="round" />
                <path d={gaugeValue} fill="none" stroke="var(--accent-high)" strokeWidth="12" strokeLinecap="round" />
                <text x={GX} y={GY - 8} className="db-gauge-value" textAnchor="middle">{Math.round(EOQ.rate * 100)}%</text>
                <text x={GX} y={GY + 6} className="db-gauge-label" textAnchor="middle">optimized</text>
              </svg>
              <div className="db-gauge-stats">
                <div className="db-metric">
                  <span className="db-metric-label">Calcs / wk</span>
                  <span className="db-metric-value">{EOQ.calcsThisWeek}</span>
                </div>
                <div className="db-metric">
                  <span className="db-metric-label">Avg order</span>
                  <span className="db-metric-value">{EOQ.avgOrderQty} u</span>
                </div>
              </div>
            </div>
          </div>

          {/* Total Order */}
          <div className="totalOrder-card card">
            <div className="db-card-head">
              <div className="db-card-titles">
                <span className="db-card-title">Total Orders</span>
              </div>
              <Delta value={ORDERS.delta} />
            </div>
            <div className="db-stat-value">{fmt(ORDERS.value)}</div>
            <div className="db-col-chart">
              {ORDERS.bars.map((v, i) => {
                const isMax = v === orderMax;
                return (
                  <div key={i} className="db-col-item">
                    <span className="db-col-bar-wrap">
                      <span className={`db-col-bar ${isMax ? 'db-col-bar-max' : ''}`} style={{ height: `${(v / orderMax) * 100}%` }} />
                    </span>
                    <span className="db-col-label">{ORDERS.labels[i]}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Product Sales */}
          <div className="productSales-card card">
            <div className="db-card-head">
              <div className="db-card-titles">
                <span className="db-card-title">Product Sales</span>
                <span className="db-card-sub">Top movers · project in Forecasting</span>
              </div>
              <button className="db-open-arrow-btn" onClick={() => go('Forecasting')} aria-label="Open in Forecasting" type="button"><OpenArrow /></button>
            </div>
            <div className="db-rank">
              {TOP_PRODUCTS.map((p, i) => (
                <div key={i} className="db-rank-row">
                  <span className="db-rank-name">{p.name}</span>
                  <span className="db-rank-track">
                    <span className="db-rank-fill" style={{ width: `${(p.units / prodMax) * 100}%` }} />
                  </span>
                  <span className="db-rank-val">{p.units}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Stock Alerts */}
          <div className="lowStockalerts-card card">
            <div className="db-card-head">
              <div className="db-card-titles">
                <span className="db-card-title">Stock Alerts</span>
                <span className="db-card-sub">{alertTotal} items need attention</span>
              </div>
              <button className="db-open-arrow-btn" onClick={() => go('Stock')} aria-label="Open in Stock" type="button"><OpenArrow /></button>
            </div>
            <div className="db-stack-bar db-stack-bar-sm">
              <span className="db-stack-seg" style={{ width: `${(ALERT_SUMMARY.out / alertTotal) * 100}%`, background: 'var(--accent-low)' }} />
              <span className="db-stack-seg" style={{ width: `${(ALERT_SUMMARY.low / alertTotal) * 100}%`, background: 'var(--accent-med)' }} />
              <span className="db-stack-seg" style={{ width: `${(ALERT_SUMMARY.reorder / alertTotal) * 100}%`, background: 'var(--accent)' }} />
            </div>
            <div className="db-alert-list">
              {ALERTS.map((a, i) => (
                <div key={i} className={`db-alert-row db-alert-${a.level}`}>
                  <span className="db-alert-dot" />
                  <span className="db-alert-name">{a.name}</span>
                  <span className="db-alert-qty">{a.level === 'out' ? 'Out of stock' : `${a.qty} left`}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Total Customers */}
          <div className="totalCustomer-card card">
            <div className="db-card-head">
              <div className="db-card-titles">
                <span className="db-card-title">Total Customers</span>
              </div>
              <Delta value={CUSTOMERS.delta} />
            </div>
            <div className="db-stat-value">{fmt(CUSTOMERS.value)}</div>
            <div className="db-stat-sub">Active buyers this quarter</div>
            <div className="db-spark-wrap">
              <Sparkline values={CUSTOMERS.spark} stroke="var(--accent)" gid="dbCustGrad" />
            </div>
          </div>

        </div>
      </div>
    </main>
  );
}

export default Dashboard;
