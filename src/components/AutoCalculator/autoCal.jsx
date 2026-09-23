import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Plus, X, Calculator, History, Download, GitCompare, Info, TrendingUp, Boxes } from 'lucide-react';
import './autoCal.css';

/*--------------------------------------------------Sample data--------------------------------------------------*/
/* SAMPLE_FORMULA — definition of the currently selected formula (default EOQ). */
   
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

/* ===== SAMPLE_PRODUCTS — products the user can auto-fill demand from (dropdown + batch compute). ===== */
   
const SAMPLE_PRODUCTS = [];

/* ===== SAMPLE_HISTORY — past calculations shown in the History panel. ===== */
   
const SAMPLE_HISTORY = [];


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
/*--------------------------------------------------Sample data end--------------------------------------------------*/


  return (

  /* ===== SAMPLE LINE GRAPH FOR EOQ FORMULA ===== */

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
      <text x={PAD.l + iW / 2} y={H - 0} className="ac-chart-axis-label" textAnchor="middle">Order Quantity (units)</text>
    </svg>
  );
}

/* ===== FUNCTION FOR MODALS ===== */
function AddFormulaModal({ onClose, onSave }) {
  const [form, setForm] = useState({ name: '', fullName: '', description: '', formula: '' });
  const [fields, setFields] = useState([{ label: '', key: '', unit: '' }]);

  const setField = (key) => (e) => setForm(prev => ({ ...prev, [key]: e.target.value }));

  const updateFieldRow = (i, key, value) =>
    setFields(prev => prev.map((row, idx) => (idx === i ? { ...row, [key]: value } : row)));

  const addFieldRow = () => setFields(prev => [...prev, { label: '', key: '', unit: '' }]);
  const removeFieldRow = (i) => setFields(prev => prev.filter((_, idx) => idx !== i));

  const canSave = form.name.trim() && form.fullName.trim() &&
    fields.some(f => f.label.trim() && f.key.trim());

  const save = () => {
    if (!canSave) return;
    onSave({
      name: form.name.trim(),
      fullName: form.fullName.trim(),
      description: form.description.trim(),
      formula: form.formula.trim() || '—',
      fields: fields
        .filter(f => f.label.trim() && f.key.trim())
        .map(f => ({ key: f.key.trim(), label: f.label.trim(), unit: f.unit.trim(), placeholder: '' })),
      custom: true,
    });
  };


/* ===== MODALS FRONTEND ===== */
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
            <input className="ac-input" value={form.name} onChange={setField('name')} placeholder="e.g. ROP" />
          </div>
          <div className="ac-field-group">
            <label className="ac-label">Full Name <span className="ac-required">*</span></label>
            <input className="ac-input" value={form.fullName} onChange={setField('fullName')} placeholder="e.g. Reorder Point" />
          </div>
          <div className="ac-field-group">
            <label className="ac-label">Description</label>
            <input className="ac-input" value={form.description} onChange={setField('description')} placeholder="What this formula computes" />
          </div>
          <div className="ac-field-group">
            <label className="ac-label">Formula Expression</label>
            <input className="ac-input" value={form.formula} onChange={setField('formula')} placeholder="e.g. d × L + SS" />
          </div>
          <div className="ac-field-group">
            <label className="ac-label">Input Fields <span className="ac-required">*</span></label>
            <div className="ac-fields-list">
              {fields.map((row, i) => (
                <div className="ac-field-row" key={i}>
                  <input className="ac-input ac-input-sm" value={row.label} onChange={e => updateFieldRow(i, 'label', e.target.value)} placeholder="Label" />
                  <input className="ac-input ac-input-sm" value={row.key} onChange={e => updateFieldRow(i, 'key', e.target.value)} placeholder="key" />
                  <input className="ac-input ac-input-sm" value={row.unit} onChange={e => updateFieldRow(i, 'unit', e.target.value)} placeholder="unit" />
                  {fields.length > 1 && (
                    <button className="ac-modal-close" type="button" onClick={() => removeFieldRow(i)} title="Remove field"><X size={12} /></button>
                  )}
                </div>
              ))}
            </div>
            <button className="ac-add-field-btn" type="button" onClick={addFieldRow}><Plus size={12} /> Add Field</button>
          </div>
        </div>
        <div className="ac-modal-footer">
          <button className="ac-btn-cancel" onClick={onClose}>Cancel</button>
          <button className="ac-btn-save" onClick={save} disabled={!canSave}>Save Formula</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

/* ===== HISTORY SIDE PANEL ===== */
function HistoryPanel({ onClose, history, onClear }) {
  return createPortal(
    <div className="ac-modal-overlay" onClick={onClose}>
      <div className="ac-modal ac-modal-wide" onClick={e => e.stopPropagation()}>
        <div className="ac-modal-header">
          <h3 className="ac-modal-title">Formula History</h3>
          <button className="ac-modal-close" onClick={onClose}><X size={14} /></button>
        </div>
        <div className="ac-modal-body">
          {history.length === 0 ? (
            <p className="ac-source-note" style={{ textAlign: 'center', padding: '20px 0' }}>
              No calculations yet. Compute an EOQ and it will be logged here.
            </p>
          ) : (
            <div className="ac-history-list">
              {history.map((h, i) => (
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
          )}
        </div>
        <div className="ac-modal-footer">
          <button className="ac-btn-cancel" onClick={onClear} disabled={history.length === 0}>Clear History</button>
        </div>
      </div>
    </div>,
    document.body
  );
}


/* ===== BATCH COMPUTATION FUNCTION ===== */
function BatchComputeModal({ onClose }) {
  const [selected, setSelected] = useState(new Set());
  const [batchS, setBatchS] = useState('');
  const [batchH, setBatchH] = useState('');
  const [results, setResults] = useState(null);

  function toggleProduct(id) {
    setSelected(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
    setResults(null);
  }

  const S = parseFloat(batchS);
  const H = parseFloat(batchH);
  const canCompute = selected.size > 0 && S > 0 && H > 0;

  const runBatch = () => {
    if (!canCompute) return;
    const rows = SAMPLE_PRODUCTS
      .filter(p => selected.has(p.id))
      .map(p => {
        const D = Number(p.demand) || 0;
        const eoq = D > 0 ? Math.sqrt((2 * D * S) / H) : 0;
        return { name: p.name, eoq };
      });
    setResults(rows);
  };

  /* ===== BATCH COMPUTATION FRONTEND ===== */
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
              {SAMPLE_PRODUCTS.length === 0 && (
                <p className="ac-source-note">No products available yet. Products come from the Product &amp; Supplier tab.</p>
              )}
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
            <input className="ac-input" type="number" min="0" value={batchS} onChange={e => { setBatchS(e.target.value); setResults(null); }} />
          </div>
          <div className="ac-input-group">
            <label className="ac-label">Holding Cost (H) (applied to all)</label>
            <input className="ac-input" type="number" min="0" value={batchH} onChange={e => { setBatchH(e.target.value); setResults(null); }} />
          </div>
          <button className="ac-btn-compute" disabled={!canCompute} onClick={runBatch}>
            Compute {selected.size} Product{selected.size !== 1 ? 's' : ''}
          </button>
          <table className="ac-batch-table">
            <thead><tr><th>Product</th><th>EOQ Result</th></tr></thead>
            <tbody>
              {!results && (
                <tr><td colSpan="2" style={{textAlign:'center', color:'var(--text-muted)', padding:'12px', fontSize:'11px'}}>Select products, enter S and H, then click Compute.</td></tr>
              )}
              {results && results.map((r, i) => (
                <tr key={i}>
                  <td>{r.name}</td>
                  <td><strong>{r.eoq.toFixed(2)}</strong> units</td>
                </tr>
              ))}
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

  /* ===== ADD FORMULA MODAL ===== */
  const [customFormulas, setCustomFormulas] = useState([]);

  /* ===== HISTORY MODAL FOR FORMULA ===== */
  const [history, setHistory] = useState(SAMPLE_HISTORY);

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

    /* ===== HISTORY ADD FUNCTION ===== */
    setHistory(prev => [
      {
        formulaName: 'EOQ',
        date: new Date().toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }),
        inputs: { D, S, H },
        result: eoq.toFixed(2),
        unit: 'units',
      },
      ...prev,
    ]);
  };

  const handleReset = () => {
    setInputs({ demand: '', orderCost: '', holdingCost: '' });
    setErrors({});
    setResult(null);
  };

  const fmtCur = (v) => `₱${v.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtNum = (v, d = 2) => v.toLocaleString('en-PH', { minimumFractionDigits: d, maximumFractionDigits: d });

  /* ===== CSV EXPORT ===== */
  const exportCsv = () => {
    if (!result) return;
    const rows = [
      ['Metric', 'Value'],
      ['Annual Demand (D)', result.D],
      ['Ordering Cost (S)', result.S],
      ['Holding Cost (H)', result.H],
      ['Economic Order Quantity (EOQ)', result.eoq.toFixed(2)],
      ['Annual Ordering Cost', result.annualOrdering.toFixed(2)],
      ['Annual Holding Cost', result.annualHolding.toFixed(2)],
      ['Total Annual Cost', result.totalCost.toFixed(2)],
      ['Orders per Year', result.ordersPerYear.toFixed(2)],
      ['Order Cycle Length (days)', result.cycleLength.toFixed(2)],
    ];
    const escape = (val) => `"${String(val ?? '').replace(/"/g, '""')}"`;
    const csv = rows.map(r => r.map(escape).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `eoq-result-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  /* ===== PDF EXPORT (STILL NEED SOME ADJUSTMENT) ===== */
  const exportPdf = () => {
    if (!result) return;
    window.print();
  };

  /* ===== SAVE FORMULA ===== */
  const handleSaveFormula = (formula) => {
    setCustomFormulas(prev => [...prev, formula]);
    setShowModal(false);
  };

  const closeCustomFormula = (name) => {
    setCustomFormulas(prev => prev.filter(f => f.name !== name));
  };

  /* Compare mode — side-by-side EOQ (A) vs Reorder Point (B). */
  const [compareA, setCompareA] = useState({ demand: '', orderCost: '', holdingCost: '' });
  const [compareB, setCompareB] = useState({ daily: '', lead: '', safety: '' });
  const [resultA, setResultA] = useState(null);
  const [resultB, setResultB] = useState(null);

  const computeCompareA = () => {
    const D = parseFloat(compareA.demand);
    const S = parseFloat(compareA.orderCost);
    const H = parseFloat(compareA.holdingCost);
    if (!(D > 0 && S > 0 && H > 0)) { setResultA(null); return; }
    setResultA(Math.sqrt((2 * D * S) / H));
  };

  const computeCompareB = () => {
    const d = parseFloat(compareB.daily);
    const L = parseFloat(compareB.lead);
    const SS = parseFloat(compareB.safety) || 0;
    if (!(d > 0 && L > 0)) { setResultB(null); return; }
    setResultB(d * L + SS);
  };

  return (
    <div className="ac-root">
{/* ===== ACTUAL FRONT END DESIGN ===== */}
      {/* Header */}
      <div className="ac-header">
        <div className="ac-header-left">
          <div className="ac-tabs">
            <div className="ac-tab active"><button className="ac-tab-btn">EOQ</button></div>
            <div className="ac-tab active"><button className="ac-tab-btn">OTHER SAMPLE FORMULAS...</button></div>
            {customFormulas.map((f) => (
              <div className="ac-tab" key={f.name}>
                <button className="ac-tab-btn" title={f.fullName}>{f.name}</button>
                <button className="ac-tab-close" onClick={() => closeCustomFormula(f.name)} title={`Remove ${f.name}`}>
                  
                  <X size={10} />
                </button>
              </div>
            ))}
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

      {/* ===== HANDOFF BANNER ===== */}
      {handoff && (
        <div className="ac-handoff-banner">
          <TrendingUp size={13} />
          <span>Received <strong>{handoff.product}</strong> — annual demand <strong>{Number(handoff.annualDemand).toLocaleString()} units/year</strong></span>
        </div>
      )}

      {/* ===== CALCULATOR BODY ===== */}
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
                  <button className="ac-btn-reset ac-export-btn" onClick={exportCsv} disabled={!result} type="button"><Download size={12} /> Export CSV</button>
                  <button className="ac-btn-reset ac-export-btn" onClick={exportPdf} disabled={!result} type="button"><Download size={12} /> Export PDF</button>
                </div>
              </div>
            </div>
          </div>

          {/* ===== COST ANALYSIS ===== */}
          <div className="ac-analysis">
            {/* Cost breakdown chart */}
            <div className="ac-analysis-chart-card">
              <div className="ac-analysis-card-head">
                <span className="ac-analysis-title">Cost Curve Analysis</span>
                <span className="ac-analysis-sub">Minimum total cost occurs at EOQ</span>
              </div>
              {result ? (
                <CostChart
                  demand={result.D}
                  orderCost={result.S}
                  holdingCost={result.H}
                  eoq={result.eoq}
                />
              ) : (
                <div className="ac-chart-placeholder">
                  <TrendingUp size={20} />
                  <span>Enter values and compute to see the cost curve.</span>
                </div>
              )}
            </div>

            {/* Derived metrics */}
            <div className="ac-metrics-grid">
              <div className="ac-metric-card">
                <span className="ac-metric-label">Annual Ordering Cost</span>
                <span className="ac-metric-value">{result ? fmtCur(result.annualOrdering) : '—'}</span>
                <span className="ac-metric-note">(D ÷ EOQ) × S</span>
              </div>
              <div className="ac-metric-card">
                <span className="ac-metric-label">Annual Holding Cost</span>
                <span className="ac-metric-value">{result ? fmtCur(result.annualHolding) : '—'}</span>
                <span className="ac-metric-note">(EOQ ÷ 2) × H</span>
              </div>
              <div className="ac-metric-card ac-metric-card-accent">
                <span className="ac-metric-label">Total Annual Cost</span>
                <span className="ac-metric-value">{result ? fmtCur(result.totalCost) : '—'}</span>
                <span className="ac-metric-note">Ordering + Holding</span>
              </div>
              <div className="ac-metric-card">
                <span className="ac-metric-label">Orders per Year</span>
                <span className="ac-metric-value">{result ? fmtNum(result.ordersPerYear, 1) : '—'}</span>
                <span className="ac-metric-note">D ÷ EOQ</span>
              </div>
              <div className="ac-metric-card">
                <span className="ac-metric-label">Order Cycle Length</span>
                <span className="ac-metric-value">{result ? `${fmtNum(result.cycleLength, 1)} days` : '—'}</span>
                <span className="ac-metric-note">365 ÷ orders/year</span>
              </div>
              <div className="ac-metric-card">
                <span className="ac-metric-label">EOQ</span>
                <span className="ac-metric-value">{result ? `${fmtNum(result.eoq)} units` : '—'}</span>
                <span className="ac-metric-note">{result ? `√(2 × ${result.D} × ${result.S} ÷ ${result.H})` : '√(2DS ÷ H)'}</span>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ===== COMPARISON MODE ===== */}
      {compareMode && (
        <div className="ac-compare-wrapper">
          {/* A: EOQ */}
          <div className="ac-compare-col">
            <div className="ac-compare-select-row">
              <label className="ac-label">Formula A</label>
              <select className="ac-input" value="eoq" disabled>
                <option value="eoq">EOQ</option>
              </select>
            </div>
            {SAMPLE_FORMULA.fields.map(field => (
              <div className="ac-input-group" key={field.key}>
                <label className="ac-label">{field.label}</label>
                <input
                  className="ac-input"
                  type="number"
                  min="0"
                  value={compareA[field.key]}
                  onChange={e => setCompareA(prev => ({ ...prev, [field.key]: e.target.value }))}
                />
              </div>
            ))}
            <button className="ac-btn-compute" onClick={computeCompareA}>Compute A</button>
            <div className="ac-compare-result">
              {resultA == null ? '—' : <>{fmtNum(resultA)} <small>units (EOQ)</small></>}
            </div>
          </div>

          {/* B: ROP */}
          <div className="ac-compare-col">
            <div className="ac-compare-select-row">
              <label className="ac-label">Formula B</label>
              <select className="ac-input" value="rop" disabled>
                <option value="rop">ROP</option>
              </select>
            </div>
            <div className="ac-input-group">
              <label className="ac-label">Daily Demand (d)</label>
              <input className="ac-input" type="number" min="0" value={compareB.daily} onChange={e => setCompareB(prev => ({ ...prev, daily: e.target.value }))} />
            </div>
            <div className="ac-input-group">
              <label className="ac-label">Lead Time (L)</label>
              <input className="ac-input" type="number" min="0" value={compareB.lead} onChange={e => setCompareB(prev => ({ ...prev, lead: e.target.value }))} />
            </div>
            <div className="ac-input-group">
              <label className="ac-label">Safety Stock (SS)</label>
              <input className="ac-input" type="number" min="0" value={compareB.safety} onChange={e => setCompareB(prev => ({ ...prev, safety: e.target.value }))} />
            </div>
            <button className="ac-btn-compute" onClick={computeCompareB}>Compute B</button>
            <div className="ac-compare-result">
              {resultB == null ? '—' : <>{fmtNum(resultB)} <small>units (ROP)</small></>}
            </div>
          </div>
        </div>
      )}

      {showModal   && <AddFormulaModal  onClose={() => setShowModal(false)} onSave={handleSaveFormula} />}
      {showHistory && <HistoryPanel     onClose={() => setShowHistory(false)} history={history} onClear={() => setHistory([])} />}
      {showBatch   && <BatchComputeModal onClose={() => setShowBatch(false)}   />}
    </div>
  );
}
