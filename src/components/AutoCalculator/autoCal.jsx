import React, { useState, useEffect, useMemo } from 'react';
import { Plus, X, Calculator, History, Download, GitCompare, Info } from 'lucide-react';
import './autoCal.css';

const DEFAULT_FORMULAS = [
  {
    id: 'eoq',
    name: 'EOQ',
    fullName: 'Economic Order Quantity',
    description: 'Computes the optimal order quantity to minimize total inventory costs including ordering and holding costs.',
    formula: '√(2DS / H)',
    fields: [
      { key: 'demand', label: 'Annual Demand (D)', placeholder: 'e.g. 1200', unit: 'units/year' },
      { key: 'orderCost', label: 'Ordering Cost (S)', placeholder: 'e.g. 500', unit: '₱ per order' },
      { key: 'holdingCost', label: 'Holding Cost (H)', placeholder: 'e.g. 50', unit: '₱ per unit/year' },
    ],
    compute: (v) => {
      const d = parseFloat(v.demand);
      const s = parseFloat(v.orderCost);
      const h = parseFloat(v.holdingCost);
      if (!d || !s || !h) return null;
      return {
        value: Math.sqrt((2 * d * s) / h).toFixed(2),
        label: 'Optimal Order Quantity',
        unit: 'units',
      };
    },
  },
  {
    id: 'rop',
    name: 'ROP',
    fullName: 'Reorder Point',
    description: 'The stock level at which a new order should be placed to avoid running out before the next delivery arrives.',
    formula: '(d × L) + SS',
    fields: [
      { key: 'dailyDemand', label: 'Daily Demand (d)', placeholder: 'e.g. 20', unit: 'units/day' },
      { key: 'leadTime', label: 'Lead Time (L)', placeholder: 'e.g. 7', unit: 'days' },
      { key: 'safetyStock', label: 'Safety Stock (SS)', placeholder: 'e.g. 30', unit: 'units' },
    ],
    compute: (v) => {
      const d = parseFloat(v.dailyDemand);
      const l = parseFloat(v.leadTime);
      const ss = parseFloat(v.safetyStock) || 0;
      if (!d || !l) return null;
      return {
        value: (d * l + ss).toFixed(2),
        label: 'Reorder Point',
        unit: 'units',
      };
    },
  },
];

// ---------- localStorage helpers ----------
const LS_HISTORY_KEY = 'ac_history';
const LS_CUSTOM_FORMULAS_KEY = 'ac_custom_formulas';

function loadHistory() {
  try {
    const raw = localStorage.getItem(LS_HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveHistory(history) {
  try {
    localStorage.setItem(LS_HISTORY_KEY, JSON.stringify(history));
  } catch (e) {
    console.error('Failed to save history:', e);
  }
}

function loadCustomFormulas() {
  try {
    const raw = localStorage.getItem(LS_CUSTOM_FORMULAS_KEY);
    if (!raw) return [];
    // compute fn can't be serialized, so we rebuild a no-op compute for restored custom formulas
    return JSON.parse(raw).map(f => ({ ...f, compute: () => null }));
  } catch {
    return [];
  }
}

function saveCustomFormulas(formulas) {
  try {
    const serializable = formulas.map(({ compute, ...rest }) => rest);
    localStorage.setItem(LS_CUSTOM_FORMULAS_KEY, JSON.stringify(serializable));
  } catch (e) {
    console.error('Failed to save custom formulas:', e);
  }
}

// NOTE ON FIREBASE (#6):
// To persist custom formulas to Firebase instead of localStorage, replace
// loadCustomFormulas/saveCustomFormulas with Firestore calls, e.g.:
//   import { collection, getDocs, addDoc } from 'firebase/firestore';
//   await addDoc(collection(db, 'customFormulas'), formulaData);
// This requires your own Firebase project config (apiKey, projectId, etc.)
// which isn't something that can be generated — you'll need to paste your
// firebaseConfig object once you've created a project in the Firebase console.

// ---------- Tooltip ----------
function InfoTooltip({ text }) {
  const [show, setShow] = useState(false);
  if (!text) return null;
  return (
    <span
      className="ac-tooltip-wrapper"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      <Info size={12} className="ac-tooltip-icon" />
      {show && <div className="ac-tooltip-box">{text}</div>}
    </span>
  );
}

// ---------- Add Formula Modal ----------
function AddFormulaModal({ onClose, onSave }) {
  const [name, setName] = useState('');
  const [fullName, setFullName] = useState('');
  const [description, setDescription] = useState('');
  const [formula, setFormula] = useState('');
  const [fields, setFields] = useState([{ key: '', label: '', unit: '' }]);

  function addField() {
    setFields(prev => [...prev, { key: '', label: '', unit: '' }]);
  }
  function removeField(i) {
    setFields(prev => prev.filter((_, idx) => idx !== i));
  }
  function updateField(i, prop, val) {
    setFields(prev => {
      const next = [...prev];
      next[i] = { ...next[i], [prop]: val };
      return next;
    });
  }
  function handleSave() {
    if (!name || !fullName || fields.some(f => !f.key || !f.label)) return;
    onSave({
      id: 'custom_' + Date.now(),
      name,
      fullName,
      description,
      formula,
      fields: fields.filter(f => f.key && f.label),
      compute: () => null,
    });
    onClose();
  }

  return (
    <div className="ac-modal-overlay" onClick={onClose}>
      <div className="ac-modal" onClick={e => e.stopPropagation()}>
        <div className="ac-modal-header">
          <h3 className="ac-modal-title">Add Custom Formula</h3>
          <button className="ac-modal-close" onClick={onClose}><X size={14} /></button>
        </div>
        <div className="ac-modal-body">
          <div className="ac-field-group">
            <label className="ac-label">Short Name <span className="ac-required">*</span></label>
            <input className="ac-input" placeholder="e.g. ROP" value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div className="ac-field-group">
            <label className="ac-label">Full Name <span className="ac-required">*</span></label>
            <input className="ac-input" placeholder="e.g. Reorder Point" value={fullName} onChange={e => setFullName(e.target.value)} />
          </div>
          <div className="ac-field-group">
            <label className="ac-label">Description</label>
            <input className="ac-input" placeholder="Brief description of the formula" value={description} onChange={e => setDescription(e.target.value)} />
          </div>
          <div className="ac-field-group">
            <label className="ac-label">Formula Expression</label>
            <input className="ac-input" placeholder="e.g. (d × L) + SS" value={formula} onChange={e => setFormula(e.target.value)} />
          </div>
          <div className="ac-field-group">
            <label className="ac-label">Input Fields <span className="ac-required">*</span></label>
            <div className="ac-fields-list">
              {fields.map((f, i) => (
                <div className="ac-field-row" key={i}>
                  <input className="ac-input ac-input-sm" placeholder="Key (e.g. demand)" value={f.key} onChange={e => updateField(i, 'key', e.target.value)} />
                  <input className="ac-input ac-input-sm" placeholder="Label (e.g. Annual Demand)" value={f.label} onChange={e => updateField(i, 'label', e.target.value)} />
                  <input className="ac-input ac-input-sm" placeholder="Unit (e.g. units)" value={f.unit} onChange={e => updateField(i, 'unit', e.target.value)} />
                  {fields.length > 1 && (
                    <button className="ac-remove-field-btn" onClick={() => removeField(i)}><X size={12} /></button>
                  )}
                </div>
              ))}
            </div>
            <button className="ac-add-field-btn" onClick={addField}>
              <Plus size={12} /> Add Field
            </button>
          </div>
        </div>
        <div className="ac-modal-footer">
          <button className="ac-btn-cancel" onClick={onClose}>Cancel</button>
          <button className="ac-btn-save" onClick={handleSave}>Save Formula</button>
        </div>
      </div>
    </div>
  );
}

// ---------- History Panel ----------
function HistoryPanel({ history, onClose, onClear }) {
  return (
    <div className="ac-modal-overlay" onClick={onClose}>
      <div className="ac-modal ac-modal-wide" onClick={e => e.stopPropagation()}>
        <div className="ac-modal-header">
          <h3 className="ac-modal-title">Formula History</h3>
          <button className="ac-modal-close" onClick={onClose}><X size={14} /></button>
        </div>
        <div className="ac-modal-body">
          {history.length === 0 && (
            <div className="ac-result-empty">No computations logged yet.</div>
          )}
          {history.length > 0 && (
            <div className="ac-history-list">
              {history.slice().reverse().map((h, i) => (
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
                  <div className="ac-history-result">
                    Result: <strong>{h.result} {h.unit}</strong>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        {history.length > 0 && (
          <div className="ac-modal-footer">
            <button className="ac-btn-cancel" onClick={onClear}>Clear History</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Multi-Product Batch Panel ----------
function BatchComputeModal({ formula, products, onClose }) {
  const [selected, setSelected] = useState(new Set());
  const [sharedInputs, setSharedInputs] = useState({});
  const [batchResults, setBatchResults] = useState(null);

  function toggleProduct(id) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function runBatch() {
    const results = products
      .filter(p => selected.has(p.id))
      .map(p => {
        const inputs = { ...sharedInputs, demand: p.avgDemand || sharedInputs.demand };
        const res = formula.compute(inputs);
        return { product: p.name, result: res };
      });
    setBatchResults(results);
  }

  return (
    <div className="ac-modal-overlay" onClick={onClose}>
      <div className="ac-modal ac-modal-wide" onClick={e => e.stopPropagation()}>
        <div className="ac-modal-header">
          <h3 className="ac-modal-title">Batch Compute — {formula.name}</h3>
          <button className="ac-modal-close" onClick={onClose}><X size={14} /></button>
        </div>
        <div className="ac-modal-body">
          <div className="ac-field-group">
            <label className="ac-label">Select Products</label>
            <div className="ac-batch-product-list">
              {products.map(p => (
                <label key={p.id} className="ac-batch-product-item">
                  <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleProduct(p.id)} />
                  {p.name}
                </label>
              ))}
            </div>
          </div>

          {formula.fields.filter(f => f.key !== 'demand').map(field => (
            <div className="ac-input-group" key={field.key}>
              <label className="ac-label">{field.label} (applied to all)</label>
              <input
                className="ac-input"
                type="number"
                placeholder={field.placeholder || '0'}
                value={sharedInputs[field.key] || ''}
                onChange={e => setSharedInputs(prev => ({ ...prev, [field.key]: e.target.value }))}
              />
            </div>
          ))}

          <button className="ac-btn-compute" onClick={runBatch} disabled={selected.size === 0}>
            Compute {selected.size} Product{selected.size !== 1 ? 's' : ''}
          </button>

          {batchResults && (
            <table className="ac-batch-table">
              <thead>
                <tr><th>Product</th><th>Result</th></tr>
              </thead>
              <tbody>
                {batchResults.map((r, i) => (
                  <tr key={i}>
                    <td>{r.product}</td>
                    <td>{r.result ? `${r.result.value} ${r.result.unit}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- Main Component ----------
function AutoCalculator({ onNavigate }) {
  const [formulas, setFormulas] = useState(DEFAULT_FORMULAS);
  const [activeId, setActiveId] = useState('eoq');
  const [values, setValues] = useState({});
  const [result, setResult] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showBatch, setShowBatch] = useState(false);
  const [compareMode, setCompareMode] = useState(false);
  const [compareId, setCompareId] = useState(null);
  const [compareValues, setCompareValues] = useState({});
  const [compareResult, setCompareResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [products, setProducts] = useState([]);
  const [selectedProductId, setSelectedProductId] = useState('');

  const active = formulas.find(f => f.id === activeId);
  const compareFormula = formulas.find(f => f.id === compareId);

  // Load persisted data on mount
  useEffect(() => {
    setHistory(loadHistory());
    const custom = loadCustomFormulas();
    if (custom.length) setFormulas(prev => [...prev, ...custom]);
  }, []);

  // Load products + compute avg demand from stock movement history
  useEffect(() => {
    Promise.all([
      fetch('/productSupplier.json').then(r => r.json()).catch(() => []),
      fetch('/stockControl.json').then(r => r.json()).catch(() => []),
    ]).then(([productList, stockList]) => {
      const withDemand = productList.map(p => {
        const outMovements = stockList.filter(
          s => s.productName === p.name && s.type === 'Stock Out'
        );
        const totalOut = outMovements.reduce((sum, s) => sum + (parseFloat(s.qty) || 0), 0);
        // rough annualized estimate: assume the movements span the observed date range
        const avgDemand = totalOut > 0 ? Math.round(totalOut * 12) : '';
        return { id: p.id, name: p.name, avgDemand };
      });
      setProducts(withDemand);
    });
  }, []);

  function logToHistory(formulaObj, inputVals, res) {
    if (!res) return;
    const entry = {
      formulaName: formulaObj.name,
      inputs: inputVals,
      result: res.value,
      unit: res.unit,
      date: new Date().toLocaleString(),
    };
    setHistory(prev => {
      const next = [...prev, entry];
      saveHistory(next);
      return next;
    });
  }

  function handleCompute() {
    if (!active) return;
    const res = active.compute(values);
    setResult(res);
    logToHistory(active, values, res);
  }

  function handleCompareCompute() {
    if (!compareFormula) return;
    const res = compareFormula.compute(compareValues);
    setCompareResult(res);
    logToHistory(compareFormula, compareValues, res);
  }

  function handleReset() {
    setValues({});
    setResult(null);
    setSelectedProductId('');
  }

  function handleTabChange(id) {
    setActiveId(id);
    setValues({});
    setResult(null);
    setSelectedProductId('');
  }

  function handleAddFormula(f) {
    setFormulas(prev => {
      const next = [...prev, f];
      saveCustomFormulas(next.filter(x => x.id.startsWith('custom_')));
      return next;
    });
    setActiveId(f.id);
    setValues({});
    setResult(null);
  }

  function handleDeleteFormula(id) {
    if (id === 'eoq') return;
    setFormulas(prev => {
      const next = prev.filter(f => f.id !== id);
      saveCustomFormulas(next.filter(x => x.id.startsWith('custom_')));
      return next;
    });
    setActiveId('eoq');
    setValues({});
    setResult(null);
  }

  function handleProductSelect(e) {
    const id = e.target.value;
    setSelectedProductId(id);
    const product = products.find(p => p.id === id);
    if (product && product.avgDemand !== '') {
      setValues(prev => ({ ...prev, demand: String(product.avgDemand) }));
    }
  }

  function handleClearHistory() {
    setHistory([]);
    saveHistory([]);
  }

  function exportCSV() {
    if (!result || !active) return;
    const rows = [
      ['Formula', active.name],
      ['Full Name', active.fullName],
      ...Object.entries(values).map(([k, v]) => [k, v]),
      ['Result', `${result.value} ${result.unit}`],
      ['Date', new Date().toLocaleString()],
    ];
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${active.name}_result_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportPDF() {
    // Simplest dependency-free approach: open a print-formatted window,
    // user picks "Save as PDF" in the print dialog.
    if (!result || !active) return;
    const w = window.open('', '_blank');
    w.document.write(`
      <html><head><title>${active.name} Result</title></head>
      <body style="font-family: sans-serif; padding: 2rem;">
        <h2>${active.fullName} (${active.name})</h2>
        <p><strong>Formula:</strong> ${active.formula || 'User-defined'}</p>
        <table border="1" cellpadding="8" style="border-collapse: collapse; margin-top: 1rem;">
          ${Object.entries(values).map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}
          <tr><td><strong>Result</strong></td><td><strong>${result.value} ${result.unit}</strong></td></tr>
        </table>
        <p style="margin-top: 1rem; color: #888; font-size: 12px;">Generated ${new Date().toLocaleString()}</p>
      </body></html>
    `);
    w.document.close();
    w.focus();
    w.print();
  }

  return (
    <div className="ac-root">

      {/* Header */}
      <div className="ac-header">
        <div></div>
        <div className="ac-header-actions">
          <button className="ac-icon-btn" onClick={() => setShowHistory(true)} title="Formula History">
            <History size={13} /> History
          </button>
          <button
            className="ac-icon-btn"
            onClick={() => setCompareMode(m => !m)}
            title="Compare Formulas"
          >
            <GitCompare size={13} /> {compareMode ? 'Exit Compare' : 'Compare'}
          </button>
          {active && products.length > 0 && (
            <button className="ac-icon-btn" onClick={() => setShowBatch(true)} title="Batch Compute">
              <Calculator size={13} /> Batch
            </button>
          )}
          <button className="ac-add-btn" onClick={() => setShowModal(true)}>
            <Plus size={13} /> Add Formula
          </button>
        </div>
      </div>

      {/* Formula Tabs */}
      <div className="ac-tabs">
        {formulas.map(f => (
          <div key={f.id} className={`ac-tab ${activeId === f.id ? 'active' : ''}`}>
            <button className="ac-tab-btn" onClick={() => handleTabChange(f.id)}>
              {f.name}
            </button>
            {f.id !== 'eoq' && (
              <button className="ac-tab-close" onClick={() => handleDeleteFormula(f.id)}>
                <X size={10} />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Product Selector */}
      {active && products.length > 0 && active.fields.some(f => f.key === 'demand') && (
        <div className="ac-product-selector">
          <label className="ac-label">Auto-fill from Product</label>
          <select className="ac-input" value={selectedProductId} onChange={handleProductSelect}>
            <option value="">— Select a product —</option>
            {products.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Calculator Body */}
      {active && !compareMode && (
        <div className="ac-body">
          <div className="ac-left">
            <div className="ac-formula-info">
              <div className="ac-formula-name">
                {active.fullName}
                <InfoTooltip text={active.description} />
              </div>
              {active.formula && (
                <div className="ac-formula-expr">
                  <Calculator size={12} />
                  <span>{active.formula}</span>
                </div>
              )}
            </div>

            <div className="ac-inputs">
              {active.fields.map(field => (
                <div className="ac-input-group" key={field.key}>
                  <label className="ac-label">{field.label}</label>
                  <div className="ac-input-row">
                    <input
                      className="ac-input"
                      type="number"
                      placeholder={field.placeholder || '0'}
                      value={values[field.key] || ''}
                      onChange={e => setValues(prev => ({ ...prev, [field.key]: e.target.value }))}
                    />
                    {field.unit && <span className="ac-unit">{field.unit}</span>}
                  </div>
                </div>
              ))}
            </div>

            <div className="ac-actions">
              <button className="ac-btn-compute" onClick={handleCompute}>Compute</button>
              <button className="ac-btn-reset" onClick={handleReset}>Reset</button>
            </div>
          </div>

          <div className="ac-right">
            <div className="ac-result-box">
              <div className="ac-result-section">
                <div className="ac-result-section-label">Formula</div>
                <div className="ac-result-formula">{active.formula || 'User-defined formula'}</div>
              </div>
              <div className="ac-result-divider" />
              <div className="ac-result-section">
                <div className="ac-result-section-label">{result ? result.label : 'Result'}</div>
                <div className={`ac-result-value ${result ? 'has-result' : ''}`}>
                  {result ? `${result.value}` : '—'}
                </div>
                {result && <div className="ac-result-unit">{result.unit}</div>}
              </div>
              {result && (
                <>
                  <div className="ac-result-hint">
                    ✅ You should order <strong>{result.value} {result.unit}</strong> per order cycle.
                  </div>
                  <div className="ac-export-actions">
                    <button className="ac-btn-reset" onClick={exportCSV}>
                      <Download size={12} /> Export CSV
                    </button>
                    <button className="ac-btn-reset" onClick={exportPDF}>
                      <Download size={12} /> Export PDF
                    </button>
                  </div>
                </>
              )}
              {!result && (
                <div className="ac-result-empty">
                  Fill in the values on the left and click <strong>Compute</strong>.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Comparison Mode */}
      {compareMode && (
        <div className="ac-compare-wrapper">
          <div className="ac-compare-col">
            <div className="ac-compare-select-row">
              <label className="ac-label">Formula A</label>
              <select className="ac-input" value={activeId} onChange={e => handleTabChange(e.target.value)}>
                {formulas.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>
            {active && (
              <>
                {active.fields.map(field => (
                  <div className="ac-input-group" key={field.key}>
                    <label className="ac-label">{field.label}</label>
                    <input
                      className="ac-input"
                      type="number"
                      placeholder={field.placeholder || '0'}
                      value={values[field.key] || ''}
                      onChange={e => setValues(prev => ({ ...prev, [field.key]: e.target.value }))}
                    />
                  </div>
                ))}
                <button className="ac-btn-compute" onClick={handleCompute}>Compute A</button>
                <div className="ac-compare-result">
                  {result ? `${result.value} ${result.unit}` : '—'}
                </div>
              </>
            )}
          </div>

          <div className="ac-compare-col">
            <div className="ac-compare-select-row">
              <label className="ac-label">Formula B</label>
              <select className="ac-input" value={compareId || ''} onChange={e => setCompareId(e.target.value)}>
                <option value="">— Select —</option>
                {formulas.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>
            {compareFormula && (
              <>
                {compareFormula.fields.map(field => (
                  <div className="ac-input-group" key={field.key}>
                    <label className="ac-label">{field.label}</label>
                    <input
                      className="ac-input"
                      type="number"
                      placeholder={field.placeholder || '0'}
                      value={compareValues[field.key] || ''}
                      onChange={e => setCompareValues(prev => ({ ...prev, [field.key]: e.target.value }))}
                    />
                  </div>
                ))}
                <button className="ac-btn-compute" onClick={handleCompareCompute}>Compute B</button>
                <div className="ac-compare-result">
                  {compareResult ? `${compareResult.value} ${compareResult.unit}` : '—'}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {showModal && (
        <AddFormulaModal onClose={() => setShowModal(false)} onSave={handleAddFormula} />
      )}
      {showHistory && (
        <HistoryPanel history={history} onClose={() => setShowHistory(false)} onClear={handleClearHistory} />
      )}
      {showBatch && active && (
        <BatchComputeModal formula={active} products={products} onClose={() => setShowBatch(false)} />
      )}
    </div>
  );
}

export default AutoCalculator;