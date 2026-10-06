import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Plus, X, Calculator, History, Download, GitCompare, Info, TrendingUp, Boxes } from 'lucide-react';
import './autoCal.css';
import { parse as mathParse } from 'mathjs';

/*--------------------------------------------------Sample data--------------------------------------------------*/
/* EOQ_FORMULA — the built-in default. It keeps its bespoke cost-curve analysis
   and is computed locally; everything else (custom formulas) is loaded from and
   evaluated by the backend. `custom: false` marks it as non-deletable. */

const EOQ_FORMULA = {
  id: 'eoq',
  name: 'EOQ',
  fullName: 'Economic Order Quantity',
  description: 'Computes the optimal order quantity to minimize total inventory costs including ordering and holding costs.',
  formula: '√(2DS / H)',
  resultUnit: 'units',
  custom: false,
  fields: [
    { key: 'demand',      label: 'Annual Demand (D)',  placeholder: '', unit: 'units/year' },
    { key: 'orderCost',   label: 'Ordering Cost (S)',  placeholder: '', unit: '₱ per order' },
    { key: 'holdingCost', label: 'Holding Cost (H)',   placeholder: '', unit: '₱ per unit/year' },
  ],
};


/* Canonicalise a user-typed expression into an explicit-operator form that BOTH
   the frontend (mathjs) and the backend evaluator agree on. mathjs understands
   implicit multiplication (2D, 2(a+b), spaced "2 D S") and we render it back with
   explicit * via toString({implicit:'show'}) — so "2D" is stored as "2 * D".
   Note: a run of letters is one variable (Excel-style): "dL" is the variable dL,
   not d*L. Use a space or * to multiply single-letter variables ("d L" / "d*L").
   If the expression doesn't parse yet, fall back to the symbol-cleaned string so
   downstream error handling can report the problem. */
function normalizeFormula(raw) {
  const pre = String(raw || '')
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/√/g, 'sqrt')
    .replace(/−/g, '-');
  try {
    return mathParse(pre).toString({ implicit: 'show' });
  } catch {
    return pre;
  }
}

/* Kept for compatibility with the chart/compare code below. */
const SAMPLE_FORMULA = EOQ_FORMULA;

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

/* Pull the variable names out of an expression using mathjs.
   A symbol is a variable unless it is a function name (sqrt, min, max, …).
   Order of first appearance is preserved. */
function parseFormulaKeys(expression) {
  if (!expression || !expression.trim()) return [];
  try {
    const node = mathParse(normalizeFormula(expression));
    const symbols = new Set();
    const functions = new Set();
    node.traverse((n) => {
      if (n.isSymbolNode) symbols.add(n.name);
      if (n.isFunctionNode && n.fn && n.fn.name) functions.add(n.fn.name);
    });
    return [...symbols].filter((s) => !functions.has(s));
  } catch {
    return [];
  }
}

function AddFormulaModal({ onClose, onSave }) {
  const [form, setForm] = useState({ name: '', fullName: '', description: '', formula: '', resultUnit: '' });
  /* Field metadata (label + unit) keyed by the variable name. The keys
     themselves come from the expression, so there's nothing to type twice. */
  const [fieldMeta, setFieldMeta] = useState({}); // { d: { label, unit }, ... }
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const setField = (key) => (e) => setForm(prev => ({ ...prev, [key]: e.target.value }));

  /* Keys detected in the current expression, in order of appearance. */
 const detectedKeys = useMemo(
  () => parseFormulaKeys(form.formula),
  [form.formula]
);

/* Is the formula even parseable right now? Used to show a hint. */
const formulaError = useMemo(() => {
  if (!form.formula.trim()) return '';
  try {
    mathParse(normalizeFormula(form.formula));
    return '';
  } catch (err) {
    return err.message;
  }
}, [form.formula]);

  const updateMeta = (key, prop, value) =>
    setFieldMeta(prev => ({ ...prev, [key]: { ...(prev[key] || {}), [prop]: value } }));

  const save = async () => {
    if (saving) return;
    setError('');

    // Explain exactly what's missing instead of silently disabling the button.
    const missing = [];
if (!form.fullName.trim()) missing.push('Full Name');
if (!form.formula.trim()) missing.push('Formula Expression');
if (formulaError) missing.push('a valid Formula Expression');
if (!formulaError && detectedKeys.length === 0) missing.push('at least one variable in the Formula Expression (e.g. D, S, H)');

    if (missing.length) {
      setError('Please fill in: ' + missing.join(', ') + '.');
      return;
    }

    setSaving(true);
    try {
      await onSave({
        // Short name (tab label) is derived from the Full Name — no separate field.
        name: form.fullName.trim(),
        fullName: form.fullName.trim(),
        description: form.description.trim(),
        formula: normalizeFormula(form.formula).trim(),
        resultUnit: form.resultUnit.trim() || 'units',
        fields: detectedKeys.map(key => ({
          key,
          label: (fieldMeta[key]?.label || '').trim() || key,
          unit: (fieldMeta[key]?.unit || '').trim(),
        })),
      });
    } catch (err) {
      setError(err.message || 'Could not save the formula.');
      setSaving(false);
    }
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
            <label className="ac-label">Full Name <span className="ac-required">*</span></label>
            <input className="ac-input" value={form.fullName} onChange={setField('fullName')} placeholder="e.g. Reorder Point" />
          </div>
          <div className="ac-field-group">
            <label className="ac-label">Description</label>
            <input className="ac-input" value={form.description} onChange={setField('description')} placeholder="What this formula computes" />
          </div>
          <div className="ac-field-group">
            <label className="ac-label">Formula Expression <span className="ac-required">*</span></label>
            <input className="ac-input" value={form.formula} onChange={setField('formula')} placeholder="e.g. sqrt(2 * D * S / H)" />
            {formulaError ? (
              <p className="ac-field-error" style={{ marginTop: 4 }}>
                Formula error: {formulaError}
              </p>
            ) : (
              <p className="ac-source-note">
                Variables are detected automatically. Functions: <code>sqrt</code>, <code>min</code>, <code>max</code>, <code>abs</code>, <code>round</code>.
              </p>
            )}
          </div>
          <div className="ac-field-group">
            <label className="ac-label">Result Unit</label>
            <input className="ac-input" value={form.resultUnit} onChange={setField('resultUnit')} placeholder="e.g. units" />
          </div>
          <div className="ac-field-group">
            <label className="ac-label">Input Fields <span className="ac-required">*</span></label>
            {detectedKeys.length === 0 ? (
              <p className="ac-source-note">
                Fields appear here automatically from the expression above.
              </p>
            ) : (
              <>
                <p className="ac-source-note" style={{ marginBottom: 6 }}>
                  Detected {detectedKeys.length} variable{detectedKeys.length !== 1 ? 's' : ''} — add a label and unit for each.
                </p>
                <div className="ac-fields-list">
                  {detectedKeys.map((key) => (
                    <div className="ac-field-row" key={key}>
                      <input
                        className="ac-input ac-input-sm"
                        value={fieldMeta[key]?.label || ''}
                        onChange={e => updateMeta(key, 'label', e.target.value)}
                        placeholder={`Label for "${key}"`}
                      />
                      <input className="ac-input ac-input-sm ac-input-key" value={key} readOnly title="Taken from the expression" />
                      <input
                        className="ac-input ac-input-sm"
                        value={fieldMeta[key]?.unit || ''}
                        onChange={e => updateMeta(key, 'unit', e.target.value)}
                        placeholder="unit"
                      />
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
          {error && <p className="ac-field-error" style={{ marginTop: '8px' }}>{error}</p>}
        </div>
        <div className="ac-modal-footer">
          <button className="ac-btn-cancel" onClick={onClose}>Cancel</button>
          <button className="ac-btn-save" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save Formula'}</button>
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

  /* ===== FORMULAS (EOQ default + custom from backend) ===== */
  const [customFormulas, setCustomFormulas] = useState([]);
  const [activeId, setActiveId] = useState(EOQ_FORMULA.id);
  const [loadError, setLoadError] = useState('');

  const allFormulas = useMemo(() => [EOQ_FORMULA, ...customFormulas], [customFormulas]);
  const activeFormula = useMemo(
    () => allFormulas.find(f => String(f.id) === String(activeId)) || EOQ_FORMULA,
    [allFormulas, activeId]
  );
  const isEoq = !activeFormula.custom;

  /* Inputs are keyed by the active formula's field keys, so the form adapts to
     however many fields the selected formula defines. */
  const [inputs, setInputs] = useState({});
  const [errors, setErrors] = useState({});
  const [result, setResult] = useState(null);     // EOQ rich result object
  const [customResult, setCustomResult] = useState(null); // { result, unit }
  const [computing, setComputing] = useState(false);

  /* ===== HISTORY ===== */
  const [history, setHistory] = useState(SAMPLE_HISTORY);

  /* Load custom formulas once. */
  useEffect(() => {
    fetch('/api/formulas', { headers: { Accept: 'application/json' } })
      .then(r => { if (!r.ok) throw new Error(`GET /api/formulas failed (${r.status})`); return r.json(); })
      .then(data => setCustomFormulas(Array.isArray(data) ? data : []))
      .catch(err => setLoadError(err.message || 'Could not load custom formulas.'));
  }, []);

  /* When the active formula changes, clear the inputs/results for a clean slate. */
  useEffect(() => {
    setInputs(Object.fromEntries(activeFormula.fields.map(f => [f.key, ''])));
    setErrors({});
    setResult(null);
    setCustomResult(null);
  }, [activeId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setInputs(prev => ({ ...prev, [name]: value }));
    setErrors(prev => ({ ...prev, [name]: '' }));
  };

  const handleProductSelect = (e) => {
    const p = SAMPLE_PRODUCTS.find(p => p.id === e.target.value);
    if (p) setInputs(prev => ({ ...prev, demand: String(p.demand) }));
  };

  const handleCompute = async () => {
    // Validate every field of the active formula is a positive number.
    const errs = {};
    activeFormula.fields.forEach(f => {
      const v = parseFloat(inputs[f.key]);
      if (inputs[f.key] === '' || inputs[f.key] == null || isNaN(v) || v < 0) {
        errs[f.key] = `Enter a valid ${f.label}`;
      }
    });
    if (Object.keys(errs).length) { setErrors(errs); return; }

    if (isEoq) {
      /* Built-in EOQ keeps its rich local analysis. */
      const D = parseFloat(inputs.demand);
      const S = parseFloat(inputs.orderCost);
      const H = parseFloat(inputs.holdingCost);
      if (!(D > 0 && S > 0 && H > 0)) {
        setErrors({
          demand: D > 0 ? '' : 'Enter a positive annual demand',
          orderCost: S > 0 ? '' : 'Enter a positive ordering cost',
          holdingCost: H > 0 ? '' : 'Enter a positive holding cost',
        });
        return;
      }
      const eoq            = Math.sqrt((2 * D * S) / H);
      const annualOrdering = (D / eoq) * S;
      const annualHolding  = (eoq / 2) * H;
      const totalCost      = annualOrdering + annualHolding;
      const ordersPerYear  = D / eoq;
      const cycleLength    = 365 / ordersPerYear;
      setResult({ eoq, annualOrdering, annualHolding, totalCost, ordersPerYear, cycleLength, D, S, H });
      setHistory(prev => [{
        formulaName: 'EOQ',
        date: new Date().toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }),
        inputs: { D, S, H },
        result: eoq.toFixed(2),
        unit: 'units',
      }, ...prev]);
      return;
    }

    /* Custom formula → evaluate on the backend. */
    /* Custom formula → evaluate in the browser with mathjs. */
      setComputing(true);
      try {
        const { evaluate } = await import('mathjs');
        const numericInputs = Object.fromEntries(
          activeFormula.fields.map(f => [f.key, parseFloat(inputs[f.key])])
        );
        const scope = {};
        for (const [k, v] of Object.entries(numericInputs)) {
          if (!Number.isFinite(v)) {
            throw new Error(`Enter a valid value for "${k}".`);
          }
          scope[k] = v;
        }
        const raw = evaluate(normalizeFormula(activeFormula.formula), scope);
        const num = Number(raw);
        if (!Number.isFinite(num)) {
          throw new Error('Formula produced a non-numeric result.');
        }
        setCustomResult({ result: num, unit: activeFormula.resultUnit || 'units' });
        setHistory(prev => [{
          formulaName: activeFormula.name,
          date: new Date().toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }),
          inputs: numericInputs,
          result: num.toLocaleString('en-PH', { maximumFractionDigits: 4 }),
          unit: activeFormula.resultUnit || 'units',
        }, ...prev]);
      } catch (err) {
        setErrors({ _form: err.message || 'Could not compute this formula.' });
      } finally {
        setComputing(false);
      }
  };

  const handleReset = () => {
    setInputs(Object.fromEntries(activeFormula.fields.map(f => [f.key, ''])));
    setErrors({});
    setResult(null);
    setCustomResult(null);
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

  /* ===== SAVE FORMULA (persist to backend) ===== */
  const handleSaveFormula = async (formula) => {
    const response = await fetch('/api/formulas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      // Backend validates `expression`; the modal builds `formula`. Send both
      // so the field names line up without changing the API contract.
      body: JSON.stringify({ ...formula, expression: formula.formula }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const msg = data.errors ? Object.values(data.errors).flat()[0] : data.message;
      throw new Error(msg || `Save failed (${response.status}).`);
    }
    setCustomFormulas(prev => [...prev, data]);
    setActiveId(data.id);     // jump to the new formula so its inputs show
    setShowModal(false);
  };

  const closeCustomFormula = async (formula) => {
    try {
      const response = await fetch(`/api/formulas/${formula.id}`, {
        method: 'DELETE',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) throw new Error(`Delete failed (${response.status})`);
      setCustomFormulas(prev => prev.filter(f => f.id !== formula.id));
      if (String(activeId) === String(formula.id)) setActiveId(EOQ_FORMULA.id);
    } catch (err) {
      setLoadError(err.message || 'Could not delete the formula.');
    }
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
            {allFormulas.map((f) => (
              <div className={`ac-tab${String(activeId) === String(f.id) ? ' active' : ''}`} key={f.id}>
                <button className="ac-tab-btn" title={f.fullName} onClick={() => setActiveId(f.id)}>{f.name}</button>
                {f.custom && (
                  <button className="ac-tab-close" onClick={() => closeCustomFormula(f)} title={`Remove ${f.name}`}>
                    <X size={10} />
                  </button>
                )}
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

      {loadError && (
        <div className="ac-handoff-banner" style={{ background: 'rgba(220,70,70,0.12)' }}>
          <X size={13} /><span>{loadError}</span>
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
                    {activeFormula.fullName}
                    <span className="ac-tooltip-wrapper"><Info size={12} className="ac-tooltip-icon" /></span>
                  </span>
                  <span className="ac-formula-expr"><Calculator size={11} />{activeFormula.formula}</span>
                  {activeFormula.description && (
                    <span className="ac-source-note" style={{ marginTop: 4 }}>{activeFormula.description}</span>
                  )}
                </div>
                {isEoq && (
                  <div className="ac-product-selector">
                    <label className="ac-label">Auto-fill from Product</label>
                    <select className="ac-input" defaultValue="" onChange={handleProductSelect}>
                      <option value="">— Select a product —</option>
                      {SAMPLE_PRODUCTS.map(p => (<option key={p.id} value={p.id}>{p.name}</option>))}
                    </select>
                    <p className="ac-source-note"><Boxes size={11} />Annual demand comes from Stock Movement records.</p>
                  </div>
                )}
              </div>

              <div className="ac-inputs-grid">
                {activeFormula.fields.map(field => (
                  <div className="ac-input-group" key={field.key}>
                    <label className="ac-label">{field.label}</label>
                    <div className="ac-input-row">
                      <input
                        className={`ac-input${errors[field.key] ? ' ac-input-error' : ''}`}
                        type="number"
                        name={field.key}
                        value={inputs[field.key] ?? ''}
                        onChange={handleInputChange}
                        placeholder={field.placeholder}
                        min="0"
                      />
                      {field.unit && <span className="ac-unit">{field.unit}</span>}
                    </div>
                    {errors[field.key] && <span className="ac-field-error">{errors[field.key]}</span>}
                  </div>
                ))}
              </div>

              {errors._form && <p className="ac-field-error" style={{ marginTop: 6 }}>{errors._form}</p>}

              <div className="ac-actions">
                <button className="ac-btn-compute" onClick={handleCompute} disabled={computing}>
                  {computing ? 'Computing…' : 'Compute'}
                </button>
                <button className="ac-btn-reset" onClick={handleReset}>Reset</button>
              </div>
            </div>

            {/* RIGHT: result */}
            <div className="ac-right">
              <div className="ac-result-box">
                <div className="ac-result-formula-row">
                  <span className="ac-result-section-label">Formula</span>
                  <span className="ac-result-formula">{activeFormula.formula}</span>
                </div>
                <div className="ac-result-divider" />
                <div className="ac-result-main">
                  <span className="ac-result-section-label">
                    {isEoq ? 'Optimal Order Quantity' : activeFormula.fullName}
                  </span>
                  <div className={`ac-result-value${(isEoq ? result : customResult) ? ' has-result' : ''}`}>
                    {isEoq
                      ? (result ? fmtNum(result.eoq) : '—')
                      : (customResult ? fmtNum(Number(customResult.result)) : '—')}
                  </div>
                  <div className="ac-result-unit">
                    {isEoq
                      ? (result ? 'units' : 'Enter values and compute')
                      : (customResult ? customResult.unit : 'Enter values and compute')}
                  </div>
                </div>
                {isEoq && result && (
                  <div className="ac-result-hint">
                    ✅ You should order <strong>{fmtNum(result.eoq)} units</strong> per order cycle.
                  </div>
                )}
                {!isEoq && customResult && (
                  <div className="ac-result-hint">
                    ✅ {activeFormula.name} = <strong>{fmtNum(Number(customResult.result))} {customResult.unit}</strong>
                  </div>
                )}
                <div className="ac-result-divider" />
                <div className="ac-export-actions">
                  <button className="ac-btn-reset ac-export-btn" onClick={exportCsv} disabled={!result || !isEoq} type="button"><Download size={12} /> Export CSV</button>
                  <button className="ac-btn-reset ac-export-btn" onClick={exportPdf} disabled={!result || !isEoq} type="button"><Download size={12} /> Export PDF</button>
                </div>
              </div>
            </div>
          </div>

          {/* ===== COST ANALYSIS (EOQ only — bespoke to that formula) ===== */}
          {isEoq && (
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
          )}
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
