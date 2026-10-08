import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Calculator, History, Download, TrendingUp, Boxes } from 'lucide-react';
import './autoCal.css';

const EOQ_FORMULA = {
  fullName: 'Economic Order Quantity',
  description: 'Computes the optimal order quantity to minimize total inventory costs including ordering and holding costs.',
  formula: '√(2DS / H)',
  fields: [
    { key: 'demand',      label: 'Annual Demand (D)',  placeholder: '', unit: 'units/year' },
    { key: 'orderCost',   label: 'Ordering Cost (S)',  placeholder: '', unit: '₱ per order' },
    { key: 'holdingCost', label: 'Holding Cost (H)',   placeholder: '', unit: '₱ per unit/year' },
  ],
};

/* ===== HISTORY SIDE PANEL ===== */
function HistoryPanel({ onClose, history, onClear }) {
  return createPortal(
    <div className="ac-modal-overlay" onClick={onClose}>
      <div className="ac-modal ac-modal-wide" onClick={e => e.stopPropagation()}>
        <div className="ac-modal-header">
          <h3 className="ac-modal-title">EOQ Calculation History</h3>
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


/* ===== MAIN COMPONENT ===== */
export default function AutoCalculatorDesign({ onNavigate, handoff }) {
  const [showHistory, setShowHistory] = useState(false);

  /* ===== PRODUCTS (for auto-fill from Stock Control history) ===== */
  const [products, setProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [productsError, setProductsError] = useState('');
  const [productsRetry, setProductsRetry] = useState(0);
  const [selectedProductId, setSelectedProductId] = useState('');
  const selectedProduct = products.find(product => String(product.id) === String(selectedProductId)) || null;

  const [inputs, setInputs] = useState({ demand: '', orderCost: '', holdingCost: '' });
  const [errors, setErrors] = useState({});
  const [result, setResult] = useState(null);
  const [saveStatus, setSaveStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const reorderPoint = selectedProduct ? Number(selectedProduct.safetyStock ?? 20) : null;
  const currentStock = selectedProduct ? Number(selectedProduct.stock ?? 0) : null;
  const reorderRequired = reorderPoint !== null && currentStock !== null && currentStock <= reorderPoint;

  /* ===== HISTORY ===== */
  const [history, setHistory] = useState([]);

  /* Load real products for the auto-fill dropdown. */
  useEffect(() => {
    let active = true;
    const loadProducts = async () => {
      setProductsLoading(true);
      setProductsError('');
      try {
        const response = await fetch('/api/products', { headers: { Accept: 'application/json' } });
        if (!response.ok) throw new Error('Unable to load products.');
        const data = await response.json();
        if (!Array.isArray(data)) throw new Error('The products response was invalid.');
        if (active) setProducts(data);
      } catch {
        if (active) setProductsError('Products could not be loaded. You can still enter EOQ inputs manually.');
      } finally {
        if (active) setProductsLoading(false);
      }
    };

    loadProducts();
    return () => { active = false; };
  }, [productsRetry]);

  useEffect(() => {
    if (!handoff?.productId || !products.length) return;
    const product = products.find(item => String(item.id) === String(handoff.productId));
    if (!product) return;

    setSelectedProductId(product.id);
    setInputs(prev => ({ ...prev, demand: String(handoff.annualDemand ?? '') }));
    setErrors(prev => ({ ...prev, demand: '' }));
    setResult(null);
  }, [handoff, products]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setInputs(prev => ({ ...prev, [name]: value }));
    setErrors(prev => ({ ...prev, [name]: '' }));
  };

  const handleProductSelect = (e) => {
    const id = e.target.value;
    setSelectedProductId(id);
    const p = products.find(pr => String(pr.id) === String(id));
    const demandValue = p
      ? (Number(p.demandFromHistory) > 0 ? p.demandFromHistory : (p.annualDemand || 0))
      : '';
    setInputs(prev => ({ ...prev, demand: String(demandValue) }));
    setErrors(prev => ({ ...prev, demand: '' }));
    setResult(null);
  };

  /* Persist a computation (with "computed by") so it appears in Reports → EOQ. */
  const saveCalculation = async (formulaName, resultValue, unit, numericInputs) => {
    const csrf = document.querySelector('meta[name="csrf-token"]')?.content || '';
    const product = products.find(pr => String(pr.id) === String(selectedProductId));
    const response = await fetch('/calculations', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-CSRF-TOKEN': csrf },
      body: JSON.stringify({
        formula: formulaName,
        result: resultValue,
        unit,
        product: product?.name || null,
        inputs: numericInputs,
      }),
    });
    if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) {
      throw new Error('Calculation could not be saved.');
    }
    const saved = await response.json();
    if (saved.saved !== true) throw new Error('Calculation could not be saved.');
  };

  const handleCompute = async () => {
    setSaveStatus('');
    const errs = {};
    EOQ_FORMULA.fields.forEach(field => {
      const value = parseFloat(inputs[field.key]);
      if (inputs[field.key] === '' || inputs[field.key] == null || isNaN(value) || value < 0) {
        errs[field.key] = `Enter a valid ${field.label}`;
      }
    });
    if (Object.keys(errs).length) { setErrors(errs); return; }

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
    const eoq = Math.sqrt((2 * D * S) / H);
    const annualOrdering = (D / eoq) * S;
    const annualHolding = (eoq / 2) * H;
    const totalCost = annualOrdering + annualHolding;
    setResult({ eoq, annualOrdering, annualHolding, totalCost, D, S, H });
    setHistory(prev => [{
      formulaName: 'EOQ',
      date: new Date().toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }),
      inputs: { D, S, H },
      result: eoq.toFixed(2),
      unit: 'units',
    }, ...prev]);
    setSaving(true);
    setSaveStatus('');
    try {
      await saveCalculation('EOQ', Number(eoq.toFixed(2)), 'units', { D, S, H });
      setSaveStatus('Calculation saved to EOQ reports.');
    } catch {
      setSaveStatus('The EOQ result is available, but it could not be saved to reports. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setInputs({ demand: '', orderCost: '', holdingCost: '' });
    setErrors({});
    setResult(null);
    setSaveStatus('');
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

  /* Opens the browser print dialog so users can save the result as a PDF. */
  const exportPdf = () => {
    if (!result) return;
    window.print();
  };

  return (
    <div className="ac-root">
      {/* Header */}
      <div className="ac-header">
        <div className="ac-header-actions">
          <button className="ac-icon-btn" onClick={() => setShowHistory(true)}><History size={13} /> History</button>
          <button className="ac-icon-btn ac-icon-btn-link" onClick={() => onNavigate && onNavigate('Forecasting')}>
            <TrendingUp size={13} /> Forecast Integration
          </button>
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
      <div className="ac-workspace">
        <section className="ac-panel ac-input-panel" aria-labelledby="ac-input-title">
          <div className="ac-panel-heading">
            <h2 id="ac-input-title">Inputs</h2>
            <span className="ac-formula-expr"><Calculator size={12} />{EOQ_FORMULA.formula}</span>
          </div>
          <p className="ac-source-note ac-panel-description">{EOQ_FORMULA.description}</p>

          <div className="ac-product-selector">
            <label className="ac-label" htmlFor="ac-product-select">Auto-fill from product</label>
            <select
              id="ac-product-select"
              className="ac-input"
              value={selectedProductId}
              onChange={handleProductSelect}
              disabled={productsLoading}
            >
              <option value="">{productsLoading ? 'Loading products…' : '— Select a product —'}</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>{product.name}</option>
              ))}
            </select>
            {productsError && (
              <div className="ac-product-error" role="alert">
                <span>{productsError}</span>
                <button type="button" onClick={() => setProductsRetry(retry => retry + 1)}>Retry</button>
              </div>
            )}
            <p className="ac-source-note">
              <Boxes size={11} /> Annual demand uses units sold in the last 12 months.
            </p>
            {selectedProduct && (
              <div className={`ac-reorder-status${reorderRequired ? ' is-due' : ''}`} role="status">
                <div className="ac-reorder-status-values">
                  <span>Reorder threshold: <strong>{reorderPoint} units</strong></span>
                  <span>Current stock: <strong>{currentStock} units</strong></span>
                </div>
                <span className="ac-reorder-status-message">
                  {reorderRequired ? 'Reorder trigger reached.' : 'Stock is above the reorder point.'}
                  {' '}EOQ calculates how much to order.
                </span>
              </div>
            )}
          </div>

          <div className="ac-inputs-grid">
            {EOQ_FORMULA.fields.map((field) => (
              <div className="ac-input-group" key={field.key}>
                <label className="ac-label" htmlFor={`ac-input-${field.key}`}>{field.label}</label>
                <div className="ac-input-row">
                  <input
                    id={`ac-input-${field.key}`}
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

          <div className="ac-actions">
            <button className="ac-btn-compute" onClick={handleCompute} type="button" disabled={saving}>
              {saving ? 'Saving…' : 'Compute EOQ'}
            </button>
            <button className="ac-btn-reset" onClick={handleReset} type="button" disabled={saving}>Reset</button>
          </div>
        </section>

        <section className="ac-panel ac-result-panel" aria-labelledby="ac-result-title">
          <div className="ac-panel-heading">
            <h2 id="ac-result-title">Computation Result</h2>
            <span className="ac-result-section-label">{EOQ_FORMULA.fullName}</span>
          </div>
          <div className="ac-result-main">
            <div key={result ? `eoq-${result.eoq}` : 'eoq-empty'} className={`ac-result-value${result ? ' has-result' : ''}`}>
              {result ? fmtNum(result.eoq) : '—'}
            </div>
            <div className="ac-result-unit">
              {result ? 'units per order' : 'Compute EOQ to see your recommended order quantity'}
            </div>
          </div>
          <div className="ac-metrics-grid">
            <div className="ac-metric-card">
              <span className="ac-metric-label">Annual Ordering Cost</span>
              <span className="ac-metric-value">{result ? fmtCur(result.annualOrdering) : '—'}</span>
            </div>
            <div className="ac-metric-card">
              <span className="ac-metric-label">Annual Holding Cost</span>
              <span className="ac-metric-value">{result ? fmtCur(result.annualHolding) : '—'}</span>
            </div>
            <div className="ac-metric-card ac-metric-card-accent">
              <span className="ac-metric-label">Total Annual Cost</span>
              <span className="ac-metric-value">{result ? fmtCur(result.totalCost) : '—'}</span>
            </div>
          </div>
          <div className="ac-export-actions">
            <button className="ac-btn-reset ac-export-btn" onClick={exportCsv} disabled={!result} type="button">
              <Download size={13} /> Export CSV
            </button>
            <button className="ac-btn-reset ac-export-btn" onClick={exportPdf} disabled={!result} type="button">
              <Download size={13} /> Export PDF
            </button>
          </div>
          {saveStatus && (
            <p className={`ac-save-status${saveStatus.startsWith('The EOQ') ? ' is-error' : ''}`} role={saveStatus.startsWith('The EOQ') ? 'alert' : 'status'} aria-live="polite">
              {saveStatus}
            </p>
          )}
        </section>
      </div>

      {showHistory && (
        <HistoryPanel
          onClose={() => setShowHistory(false)}
          history={history}
          onClear={() => setHistory([])}
        />
      )}
    </div>
  );
}
