import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Plus, X, Calculator, History, Download, GitCompare, Info, TrendingUp, Boxes } from 'lucide-react';
import './autoCal.css';

/*--------------------------------------------------Sample data--------------------------------------------------*/
const SAMPLE_FORMULA = {
  name: 'EOQ',
  fullName: 'Economic Order Quantity',
  description: 'Computes the optimal order quantity to minimize total inventory costs including ordering and holding costs.',
  formula: '√(2DS / H)',
  fields: [
    { key: 'demand',      label: 'Annual Demand (D)',  placeholder: '', unit: 'units/year' },
    { key: 'orderCost',   label: 'Ordering Cost (S)',  placeholder: '', unit: '₱ per order' },
    { key: 'holdingCost', label: 'Holding Cost (H)',   placeholder: '', unit: '₱ per unit/year' },
  ],
};

const SAMPLE_PRODUCTS = [];

const SAMPLE_HISTORY = [];
/*--------------------------------------------------Sample data end--------------------------------------------------*/

/* ===== COST CHART ===== */
function CostChart({ demand, orderCost, holdingCost, eoq }) {
  const W = 480, H = 180, PAD = { t: 16, r: 16, b: 36, l: 52 };
  const iW = W - PAD.l - PAD.r;
  const iH = H - PAD.t - PAD.b;

  const qMin = Math.max(1, eoq * 0.15);
  const qMax = eoq * 3.2;
  const STEPS = 80;

  const points = Array.from({ length: STEPS + 1 }, (_, i) => {
    const q = qMin + (i / STEPS) * (qMax - qMin);
    const oc = (demand / q) * orderCost;
    const hc = (q / 2) * holdingCost;
    return { q, oc, hc, tc: oc + hc };
  });

  const maxCost = Math.max(...points.map(p => p.tc)) * 1.08;
  const minCost = 0;

  const xScale = q => PAD.l + ((q - qMin) / (qMax - qMin)) * iW;
  const yScale = v => PAD.t + iH - ((v - minCost) / (maxCost - minCost)) * iH;

  const lineD = (key) => points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xScale(p.q).toFixed(1)},${yScale(p[key]).toFixed(1)}`).join(' ');

  const eoqX = xScale(eoq);
  const eoqY = yScale((demand / eoq) * orderCost + (eoq / 2) * holdingCost);

  // y-axis ticks
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(t => ({
    v: minCost + t * (maxCost - minCost),
    y: PAD.t + iH - t * iH,
  }));

  // x-axis ticks
  const xTicks = [0, 0.25, 0.5, 0.75, 1].map(t => ({
    q: qMin + t * (qMax - qMin),
    x: PAD.l + t * iW,
  }));

  const fmt = v => v >= 1000 ? `₱${(v/1000).toFixed(1)}k` : `₱${Math.round(v)}`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="ac-chart-svg" aria-label="EOQ cost curve chart">
      {/* grid lines */}
      {yTicks.map((t, i) => (
        <line key={i} x1={PAD.l} y1={t.y} x2={PAD.l + iW} y2={t.y} stroke="var(--hairline)" strokeWidth="1" strokeDasharray="3 3" />
      ))}
      {/* y-axis labels */}
      {yTicks.map((t, i) => (
        <text key={i} x={PAD.l - 5} y={t.y + 4} className="ac-chart-tick" textAnchor="end">{fmt(t.v)}</text>
      ))}
      {/* x-axis labels */}
      {xTicks.map((t, i) => (
        <text key={i} x={t.x} y={H - 6} className="ac-chart-tick" textAnchor="middle">{Math.round(t.q)}</text>
      ))}
      {/* axes */}
      <line x1={PAD.l} y1={PAD.t} x2={PAD.l} y2={PAD.t + iH} stroke="var(--hairline)" strokeWidth="1" />
      <line x1={PAD.l} y1={PAD.t + iH} x2={PAD.l + iW} y2={PAD.t + iH} stroke="var(--hairline)" strokeWidth="1" />
      {/* ordering cost curve */}
      <path d={lineD('oc')} fill="none" stroke="var(--accent-med)" strokeWidth="1.8" strokeDasharray="5 3" strokeLinecap="round" />
      {/* holding cost curve */}
      <path d={lineD('hc')} fill="none" stroke="var(--accent-low)" strokeWidth="1.8" strokeDasharray="5 3" strokeLinecap="round" />
      {/* total cost curve */}
      <path d={lineD('tc')} fill="none" stroke="var(--accent-high)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {/* EOQ vertical marker */}
      <line x1={eoqX} y1={PAD.t} x2={eoqX} y2={PAD.t + iH} stroke="var(--accent)" strokeWidth="1.5" strokeDasharray="4 2" />
      {/* EOQ dot */}
      <circle cx={eoqX} cy={eoqY} r="5" fill="var(--accent)" stroke="var(--bg-card)" strokeWidth="2" />
      {/* EOQ label */}
      <text x={eoqX + 7} y={eoqY - 6} className="ac-chart-eoq-label">EOQ={eoq.toFixed(1)}</text>
      {/* legend */}
      <g transform={`translate(${PAD.l + 8}, ${PAD.t + 6})`}>
        <rect x="0" y="0" width="8" height="3" rx="1" fill="var(--accent-high)" />
        <text x="12" y="4" className="ac-chart-legend">Total Cost</text>
        <rect x="72" y="0" width="8" height="3" rx="1" fill="var(--accent-med)" />
        <text x="84" y="4" className="ac-chart-legend">Ordering Cost</text>
        <rect x="166" y="0" width="8" height="3" rx="1" fill="var(--accent-low)" />
        <text x="178" y="4" className="ac-chart-legend">Holding Cost</text>
      </g>
      {/* axis labels */}
      <text x={PAD.l + iW / 2} y={H - 1} className="ac-chart-axis-label" textAnchor="middle">Order Quantity (units)</text>
    </svg>
  );
}

/* ===== MODALS ===== */
function AddFormulaModal({ onClose }) {
  return createPortal(
    <div className="ac-modal-overlay" onClick={onClose}>
      <div className="ac-modal" onClick={e => e.stopPropagation()}>
        <div className="ac-modal-header">
          <h3 className="ac-modal-title">Add Custom Formula</h3>
          <button className="ac-modal-close" onClick={onClose}><X size={14} /></button>
        </div>
        <div className="ac-modal-body">
          <div className="ac-field-group">
            <label className="ac-label">Short Name <span className="ac-required">*</span></label>
            <input className="ac-input" placeholder="" />
          </div>
          <div className="ac-field-group">
            <label className="ac-label">Full Name <span className="ac-required">*</span></label>
            <input className="ac-input" placeholder="" />
          </div>
          <div className="ac-field-group">
            <label className="ac-label">Description</label>
            <input className="ac-input" placeholder="" />
          </div>
          <div className="ac-field-group">
            <label className="ac-label">Formula Expression</label>
            <input className="ac-input" placeholder="" />
          </div>
          <div className="ac-field-group">
            <label className="ac-label">Input Fields <span className="ac-required">*</span></label>
            <div className="ac-fields-list">
              <div className="ac-field-row">
                <input className="ac-input ac-input-sm" placeholder="" />
                <input className="ac-input ac-input-sm" placeholder="" />
                <input className="ac-input ac-input-sm" placeholder="" />
              </div>
            </div>
            <button className="ac-add-field-btn"><Plus size={12} /> Add Field</button>
          </div>
        </div>
        <div className="ac-modal-footer">
          <button className="ac-btn-cancel" onClick={onClose}>Cancel</button>
          <button className="ac-btn-save" onClick={onClose}>Save Formula</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function HistoryPanel({ onClose }) {
  return createPortal(
    <div className="ac-modal-overlay" onClick={onClose}>
      <div className="ac-modal ac-modal-wide" onClick={e => e.stopPropagation()}>
        <div className="ac-modal-header">
          <h3 className="ac-modal-title">Formula History</h3>
          <button className="ac-modal-close" onClick={onClose}><X size={14} /></button>
        </div>
        <div className="ac-modal-body">
          <div className="ac-history-list">
            {SAMPLE_HISTORY.map((h, i) => (
              <div className="ac-history-item" key={i}>
                <div className="ac-history-top">
                  <span className="ac-history-formula">{h.formulaName}</span>
                  <span className="ac-history-date">{h.date}</span>
                </div>
                <div className="ac-history-inputs">
                  {Object.entries(h.inputs).map(([k, v]) => (
                    <span key={k} className="ac-history-input-chip">{k}: {v}</span>
                  ))}
                </div>
                <div className="ac-history-result">Result: <strong>{h.result} {h.unit}</strong></div>
              </div>
            ))}
          </div>
        </div>
        <div className="ac-modal-footer">
          <button className="ac-btn-cancel" onClick={onClose}>Clear History</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function BatchComputeModal({ onClose }) {
  const [selected, setSelected] = useState(new Set());
  function toggleProduct(id) {
    setSelected(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }
  return createPortal(
    <div className="ac-modal-overlay" onClick={onClose}>
      <div className="ac-modal ac-modal-wide" onClick={e => e.stopPropagation()}>
        <div className="ac-modal-header">
          <h3 className="ac-modal-title">Batch Compute — EOQ</h3>
          <button className="ac-modal-close" onClick={onClose}><X size={14} /></button>
        </div>
        <div className="ac-modal-body">
          <div className="ac-field-group">
            <label className="ac-label">Select Products</label>
            <div className="ac-batch-product-list">
              {SAMPLE_PRODUCTS.map(p => (
                <label key={p.id} className="ac-batch-product-item">
                  <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleProduct(p.id)} />
                  {p.name}
                </label>
              ))}
            </div>
          </div>
          <div className="ac-input-group">
            <label className="ac-label">Ordering Cost (S) (applied to all)</label>
            <input className="ac-input" type="number" placeholder="" />
          </div>
          <div className="ac-input-group">
            <label className="ac-label">Holding Cost (H) (applied to all)</label>
            <input className="ac-input" type="number" placeholder="" />
          </div>
          <button className="ac-btn-compute" disabled={selected.size === 0}>
            Compute {selected.size} Product{selected.size !== 1 ? 's' : ''}
          </button>
          <table className="ac-batch-table">
            <thead><tr><th>Product</th><th>Result</th></tr></thead>
            <tbody>
              {selected.size === 0 && (
                <tr><td colSpan="2" style={{textAlign:'center', color:'var(--text-muted)', padding:'12px', fontSize:'11px'}}>Select products and click Compute to see results.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>,
    document.body
  );
}

/* ===== MAIN COMPONENT ===== */
export default function AutoCalculatorDesign({ onNavigate, handoff }) {
  const [showModal,   setShowModal]   = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showBatch,   setShowBatch]   = useState(false);
  const [compareMode, setCompareMode] = useState(false);

  const [inputs, setInputs] = useState({ demand: '', orderCost: '', holdingCost: '' });
  const [errors, setErrors] = useState({});
  const [result, setResult] = useState(null); // null = not yet computed

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setInputs(prev => ({ ...prev, [name]: value }));
    setErrors(prev => ({ ...prev, [name]: '' }));
  };

  const handleProductSelect = (e) => {
    const p = SAMPLE_PRODUCTS.find(p => p.id === e.target.value);
    if (p) setInputs(prev => ({ ...prev, demand: String(p.demand) }));
  };

  const handleCompute = () => {
    const errs = {};
    const D = parseFloat(inputs.demand);
    const S = parseFloat(inputs.orderCost);
    const H = parseFloat(inputs.holdingCost);
    if (!inputs.demand || isNaN(D) || D <= 0) errs.demand = 'Enter a positive annual demand';
    if (!inputs.orderCost || isNaN(S) || S <= 0) errs.orderCost = 'Enter a positive ordering cost';
    if (!inputs.holdingCost || isNaN(H) || H <= 0) errs.holdingCost = 'Enter a positive holding cost';
    if (Object.keys(errs).length) { setErrors(errs); return; }

    const eoq           = Math.sqrt((2 * D * S) / H);
    const annualOrdering = (D / eoq) * S;
    const annualHolding  = (eoq / 2) * H;
    const totalCost      = annualOrdering + annualHolding;
    const ordersPerYear  = D / eoq;
    const cycleLength    = 365 / ordersPerYear;

    setResult({ eoq, annualOrdering, annualHolding, totalCost, ordersPerYear, cycleLength, D, S, H });
  };

  const handleReset = () => {
    setInputs({ demand: '', orderCost: '', holdingCost: '' });
    setErrors({});
    setResult(null);
  };

  const fmtCur = (v) => `₱${v.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtNum = (v, d = 2) => v.toLocaleString('en-PH', { minimumFractionDigits: d, maximumFractionDigits: d });

  return (
    <div className="ac-root">

      {/* Header */}
      <div className="ac-header">
        <div className="ac-header-left">
          <div className="ac-tabs">
            <div className="ac-tab active"><button className="ac-tab-btn">EOQ</button></div>
            <div className="ac-tab">
              <button className="ac-tab-btn">ROP</button>
              <button className="ac-tab-close"><X size={10} /></button>
            </div>
          </div>
        </div>
        <div className="ac-header-actions">
          <button className="ac-icon-btn" onClick={() => setShowHistory(true)}><History size={13} /> History</button>
          <button className="ac-icon-btn" onClick={() => setCompareMode(m => !m)}><GitCompare size={13} /> {compareMode ? 'Exit Compare' : 'Compare'}</button>
          <button className="ac-icon-btn" onClick={() => setShowBatch(true)}><Calculator size={13} /> Batch</button>
          <button className="ac-icon-btn ac-icon-btn-link" onClick={() => onNavigate && onNavigate('Forecasting')}>
            <TrendingUp size={13} /> Forecast Integration
          </button>
          <button className="ac-add-btn" onClick={() => setShowModal(true)}><Plus size={13} /> Add Formula</button>
        </div>
      </div>

      {/* Handoff Banner */}
      {handoff && (
        <div className="ac-handoff-banner">
          <TrendingUp size={13} />
          <span>Received <strong>{handoff.product}</strong> — annual demand <strong>{Number(handoff.annualDemand).toLocaleString()} units/year</strong></span>
        </div>
      )}

      {/* Calculator Body */}
      {!compareMode && (
        <>
          <div className="ac-body">
            {/* LEFT: inputs */}
            <div className="ac-left">
              <div className="ac-top-bar">
                <div className="ac-formula-info">
                  <span className="ac-formula-name">
                    {SAMPLE_FORMULA.fullName}
                    <span className="ac-tooltip-wrapper"><Info size={12} className="ac-tooltip-icon" /></span>
                  </span>
                  <span className="ac-formula-expr"><Calculator size={11} />{SAMPLE_FORMULA.formula}</span>
                </div>
                <div className="ac-product-selector">
                  <label className="ac-label">Auto-fill from Product</label>
                  <select className="ac-input" defaultValue="" onChange={handleProductSelect}>
                    <option value="">— Select a product —</option>
                    {SAMPLE_PRODUCTS.map(p => (<option key={p.id} value={p.id}>{p.name}</option>))}
                  </select>
                  <p className="ac-source-note"><Boxes size={11} />Annual demand comes from Stock Movement records.</p>
                </div>
              </div>

              <div className="ac-inputs-grid">
                {SAMPLE_FORMULA.fields.map(field => (
                  <div className="ac-input-group" key={field.key}>
                    <label className="ac-label">{field.label}</label>
                    <div className="ac-input-row">
                      <input
                        className={`ac-input${errors[field.key] ? ' ac-input-error' : ''}`}
                        type="number"
                        name={field.key}
                        value={inputs[field.key]}
                        onChange={handleInputChange}
                        placeholder={field.placeholder}
                        min="0"
                      />
                      <span className="ac-unit">{field.unit}</span>
                    </div>
                    {errors[field.key] && <span className="ac-field-error">{errors[field.key]}</span>}
                  </div>
                ))}
              </div>

              <div className="ac-actions">
                <button className="ac-btn-compute" onClick={handleCompute}>Compute</button>
                <button className="ac-btn-reset" onClick={handleReset}>Reset</button>
              </div>
            </div>

            {/* RIGHT: result */}
            <div className="ac-right">
              <div className="ac-result-box">
                <div className="ac-result-formula-row">
                  <span className="ac-result-section-label">Formula</span>
                  <span className="ac-result-formula">{SAMPLE_FORMULA.formula}</span>
                </div>
                <div className="ac-result-divider" />
                <div className="ac-result-main">
                  <span className="ac-result-section-label">Optimal Order Quantity</span>
                  <div className={`ac-result-value${result ? ' has-result' : ''}`}>
                    {result ? fmtNum(result.eoq) : '—'}
                  </div>
                  <div className="ac-result-unit">{result ? 'units' : 'Enter values and compute'}</div>
                </div>
                {result && (
                  <div className="ac-result-hint">
                    ✅ You should order <strong>{fmtNum(result.eoq)} units</strong> per order cycle.
                  </div>
                )}
                <div className="ac-result-divider" />
                <div className="ac-export-actions">
                  <button className="ac-btn-reset ac-export-btn"><Download size={12} /> Export CSV</button>
                  <button className="ac-btn-reset ac-export-btn"><Download size={12} /> Export PDF</button>
                </div>
              </div>
            </div>
          </div>

          {/* BOTTOM: cost analysis (shown after compute) */}
          {result && (
            <div className="ac-analysis">
              {/* Cost breakdown chart */}
              <div className="ac-analysis-chart-card">
                <div className="ac-analysis-card-head">
                  <span className="ac-analysis-title">Cost Curve Analysis</span>
                  <span className="ac-analysis-sub">Minimum total cost occurs at EOQ</span>
                </div>
                <CostChart
                  demand={result.D}
                  orderCost={result.S}
                  holdingCost={result.H}
                  eoq={result.eoq}
                />
              </div>

              {/* Derived metrics */}
              <div className="ac-metrics-grid">
                <div className="ac-metric-card">
                  <span className="ac-metric-label">Annual Ordering Cost</span>
                  <span className="ac-metric-value">{fmtCur(result.annualOrdering)}</span>
                  <span className="ac-metric-note">(D ÷ EOQ) × S</span>
                </div>
                <div className="ac-metric-card">
                  <span className="ac-metric-label">Annual Holding Cost</span>
                  <span className="ac-metric-value">{fmtCur(result.annualHolding)}</span>
                  <span className="ac-metric-note">(EOQ ÷ 2) × H</span>
                </div>
                <div className="ac-metric-card ac-metric-card-accent">
                  <span className="ac-metric-label">Total Annual Cost</span>
                  <span className="ac-metric-value">{fmtCur(result.totalCost)}</span>
                  <span className="ac-metric-note">Ordering + Holding</span>
                </div>
                <div className="ac-metric-card">
                  <span className="ac-metric-label">Orders per Year</span>
                  <span className="ac-metric-value">{fmtNum(result.ordersPerYear, 1)}</span>
                  <span className="ac-metric-note">D ÷ EOQ</span>
                </div>
                <div className="ac-metric-card">
                  <span className="ac-metric-label">Order Cycle Length</span>
                  <span className="ac-metric-value">{fmtNum(result.cycleLength, 1)} days</span>
                  <span className="ac-metric-note">365 ÷ orders/year</span>
                </div>
                <div className="ac-metric-card">
                  <span className="ac-metric-label">EOQ</span>
                  <span className="ac-metric-value">{fmtNum(result.eoq)} units</span>
                  <span className="ac-metric-note">√(2 × {result.D} × {result.S} ÷ {result.H})</span>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Comparison Mode */}
      {compareMode && (
        <div className="ac-compare-wrapper">
          <div className="ac-compare-col">
            <div className="ac-compare-select-row">
              <label className="ac-label">Formula A</label>
              <select className="ac-input" defaultValue="eoq">
                <option value="eoq">EOQ</option><option value="rop">ROP</option>
              </select>
            </div>
            {SAMPLE_FORMULA.fields.map(field => (
              <div className="ac-input-group" key={field.key}>
                <label className="ac-label">{field.label}</label>
                <input className="ac-input" type="number" placeholder={field.placeholder} />
              </div>
            ))}
            <button className="ac-btn-compute">Compute A</button>
            <div className="ac-compare-result">—</div>
          </div>
          <div className="ac-compare-col">
            <div className="ac-compare-select-row">
              <label className="ac-label">Formula B</label>
              <select className="ac-input" defaultValue="rop">
                <option value="eoq">EOQ</option><option value="rop">ROP</option>
              </select>
            </div>
            <div className="ac-input-group">
              <label className="ac-label">Daily Demand (d)</label>
              <input className="ac-input" type="number" placeholder="" />
            </div>
            <div className="ac-input-group">
              <label className="ac-label">Lead Time (L)</label>
              <input className="ac-input" type="number" placeholder="" />
            </div>
            <div className="ac-input-group">
              <label className="ac-label">Safety Stock (SS)</label>
              <input className="ac-input" type="number" placeholder="" />
            </div>
            <button className="ac-btn-compute">Compute B</button>
            <div className="ac-compare-result">—</div>
          </div>
        </div>
      )}

      {showModal   && <AddFormulaModal  onClose={() => setShowModal(false)}   />}
      {showHistory && <HistoryPanel     onClose={() => setShowHistory(false)} />}
      {showBatch   && <BatchComputeModal onClose={() => setShowBatch(false)}   />}
    </div>
  );
}
