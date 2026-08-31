import React, { useState } from 'react';
import { Plus, X, Calculator, History, Download, GitCompare, Info, TrendingUp, Boxes } from 'lucide-react';
import './autoCal.css';

/*
  DESIGN VERSION — modals open/close for real (that's just UI state),
  but there's no compute logic, no EOQ/ROP math, no localStorage,
  no product fetch, and no CSV/PDF export. Numbers shown are static
  sample data, not calculated.

  Swap this out for the fully functional AutoCalculator once the
  design is signed off.
*/

const SAMPLE_FORMULA = {
  name: 'EOQ',
  fullName: 'Economic Order Quantity',
  description: 'Computes the optimal order quantity to minimize total inventory costs including ordering and holding costs.',
  formula: '√(2DS / H)',
  fields: [
    { key: 'demand', label: 'Annual Demand (D)', placeholder: 'e.g. 1200', unit: 'units/year' },
    { key: 'orderCost', label: 'Ordering Cost (S)', placeholder: 'e.g. 500', unit: '₱ per order' },
    { key: 'holdingCost', label: 'Holding Cost (H)', placeholder: 'e.g. 50', unit: '₱ per unit/year' },
  ],
};

const SAMPLE_RESULT = { value: '109.54', label: 'Optimal Order Quantity', unit: 'units' };

const SAMPLE_PRODUCTS = [
  { id: 'p1', name: 'Precision Steel Chronograph' },
  { id: 'p2', name: 'Water-Resistant Diver Strap' },
  { id: 'p3', name: 'Sapphire Crystal Glass Face' },
];

const SAMPLE_HISTORY = [
  { formulaName: 'EOQ', inputs: { demand: 1200, orderCost: 500, holdingCost: 50 }, result: '109.54', unit: 'units', date: '8/23/2026, 10:14 AM' },
  { formulaName: 'ROP', inputs: { dailyDemand: 20, leadTime: 7, safetyStock: 30 }, result: '170.00', unit: 'units', date: '8/22/2026, 4:02 PM' },
];

// ---------- Add Formula Modal ----------
function AddFormulaModal({ onClose }) {
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
            <input className="ac-input" placeholder="e.g. ROP" />
          </div>
          <div className="ac-field-group">
            <label className="ac-label">Full Name <span className="ac-required">*</span></label>
            <input className="ac-input" placeholder="e.g. Reorder Point" />
          </div>
          <div className="ac-field-group">
            <label className="ac-label">Description</label>
            <input className="ac-input" placeholder="Brief description of the formula" />
          </div>
          <div className="ac-field-group">
            <label className="ac-label">Formula Expression</label>
            <input className="ac-input" placeholder="e.g. (d × L) + SS" />
          </div>
          <div className="ac-field-group">
            <label className="ac-label">Input Fields <span className="ac-required">*</span></label>
            <div className="ac-fields-list">
              <div className="ac-field-row">
                <input className="ac-input ac-input-sm" placeholder="Key (e.g. demand)" />
                <input className="ac-input ac-input-sm" placeholder="Label (e.g. Annual Demand)" />
                <input className="ac-input ac-input-sm" placeholder="Unit (e.g. units)" />
              </div>
            </div>
            <button className="ac-add-field-btn">
              <Plus size={12} /> Add Field
            </button>
          </div>
        </div>
        <div className="ac-modal-footer">
          <button className="ac-btn-cancel" onClick={onClose}>Cancel</button>
          <button className="ac-btn-save" onClick={onClose}>Save Formula</button>
        </div>
      </div>
    </div>
  );
}

// ---------- History Panel ----------
function HistoryPanel({ onClose }) {
  return (
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
                <div className="ac-history-result">
                  Result: <strong>{h.result} {h.unit}</strong>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="ac-modal-footer">
          <button className="ac-btn-cancel" onClick={onClose}>Clear History</button>
        </div>
      </div>
    </div>
  );
}

// ---------- Batch Compute Modal ----------
function BatchComputeModal({ onClose }) {
  const [selected, setSelected] = useState(new Set());

  function toggleProduct(id) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return (
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
            <input className="ac-input" type="number" placeholder="0" />
          </div>
          <div className="ac-input-group">
            <label className="ac-label">Holding Cost (H) (applied to all)</label>
            <input className="ac-input" type="number" placeholder="0" />
          </div>

          <button className="ac-btn-compute" disabled={selected.size === 0}>
            Compute {selected.size} Product{selected.size !== 1 ? 's' : ''}
          </button>

          <table className="ac-batch-table">
            <thead>
              <tr><th>Product</th><th>Result</th></tr>
            </thead>
            <tbody>
              <tr><td>Precision Steel Chronograph</td><td>96.20 units</td></tr>
              <tr><td>Water-Resistant Diver Strap</td><td>142.75 units</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ---------- Main Component ----------
export default function AutoCalculatorDesign({ onNavigate, handoff }) {
  const [showModal, setShowModal] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showBatch, setShowBatch] = useState(false);
  const [compareMode, setCompareMode] = useState(false);

  return (
    <div className="ac-root">

      {/* Header — tabs and actions on one line, divider below */}
      <div className="ac-header">
        <div className="ac-tabs">
          <div className="ac-tab active">
            <button className="ac-tab-btn">EOQ</button>
          </div>
          <div className="ac-tab">
            <button className="ac-tab-btn">ROP</button>
            <button className="ac-tab-close"><X size={10} /></button>
          </div>
        </div>
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
          <button className="ac-icon-btn" onClick={() => setShowBatch(true)} title="Batch Compute">
            <Calculator size={13} /> Batch
          </button>
          <button
            className="ac-icon-btn ac-icon-btn-link"
            onClick={() => onNavigate && onNavigate('Forecasting')}
            title="Pull the forecasted demand from Sales Forecasting"
          >
            <TrendingUp size={13} /> Forecast Integration
          </button>
          <button className="ac-add-btn" onClick={() => setShowModal(true)}>
            <Plus size={13} /> Add Formula
          </button>
        </div>
      </div>

      {/* Arrived here from Stock Control or Forecasting — shows what was
          handed over. Once inputs are state-bound this also fills them. */}
      {handoff && (
        <div className="ac-handoff-banner">
          <TrendingUp size={13} />
          <span>
            Received <strong>{handoff.product}</strong> — annual demand{' '}
            <strong>{Number(handoff.annualDemand).toLocaleString()} units/year</strong>
          </span>
        </div>
      )}

      {/* Product Selector */}
      <div className="ac-product-selector">
        <label className="ac-label">Auto-fill from Product</label>
        <select className="ac-input" defaultValue="">
          <option value="">— Select a product —</option>
          {SAMPLE_PRODUCTS.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <p className="ac-source-note">
          <Boxes size={11} />
          Annual demand is derived from this product's Stock Movement records.
        </p>
      </div>

      {/* Calculator Body */}
      {!compareMode && (
        <div className="ac-body">
          <div className="ac-left">
            <div className="ac-formula-info">
              <div className="ac-formula-name">
                {SAMPLE_FORMULA.fullName}
                <span className="ac-tooltip-wrapper">
                  <Info size={12} className="ac-tooltip-icon" />
                </span>
              </div>
              <div className="ac-formula-expr">
                <Calculator size={12} />
                <span>{SAMPLE_FORMULA.formula}</span>
              </div>
            </div>

            <div className="ac-inputs">
              {SAMPLE_FORMULA.fields.map(field => (
                <div className="ac-input-group" key={field.key}>
                  <label className="ac-label">{field.label}</label>
                  <div className="ac-input-row">
                    <input className="ac-input" type="number" placeholder={field.placeholder} />
                    <span className="ac-unit">{field.unit}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="ac-actions">
              <button className="ac-btn-compute">Compute</button>
              <button className="ac-btn-reset">Reset</button>
            </div>
          </div>

          <div className="ac-right">
            <div className="ac-result-box">
              <div className="ac-result-section">
                <div className="ac-result-section-label">Formula</div>
                <div className="ac-result-formula">{SAMPLE_FORMULA.formula}</div>
              </div>
              <div className="ac-result-divider" />
              <div className="ac-result-section">
                <div className="ac-result-section-label">{SAMPLE_RESULT.label}</div>
                <div className="ac-result-value has-result">{SAMPLE_RESULT.value}</div>
                <div className="ac-result-unit">{SAMPLE_RESULT.unit}</div>
              </div>
              <div className="ac-result-hint">
                ✅ You should order <strong>{SAMPLE_RESULT.value} {SAMPLE_RESULT.unit}</strong> per order cycle.
              </div>
              <div className="ac-export-actions">
                <button className="ac-btn-reset">
                  <Download size={12} /> Export CSV
                </button>
                <button className="ac-btn-reset">
                  <Download size={12} /> Export PDF
                </button>
              </div>
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
              <select className="ac-input" defaultValue="eoq">
                <option value="eoq">EOQ</option>
                <option value="rop">ROP</option>
              </select>
            </div>
            {SAMPLE_FORMULA.fields.map(field => (
              <div className="ac-input-group" key={field.key}>
                <label className="ac-label">{field.label}</label>
                <input className="ac-input" type="number" placeholder={field.placeholder} />
              </div>
            ))}
            <button className="ac-btn-compute">Compute A</button>
            <div className="ac-compare-result">109.54 units</div>
          </div>

          <div className="ac-compare-col">
            <div className="ac-compare-select-row">
              <label className="ac-label">Formula B</label>
              <select className="ac-input" defaultValue="rop">
                <option value="eoq">EOQ</option>
                <option value="rop">ROP</option>
              </select>
            </div>
            <div className="ac-input-group">
              <label className="ac-label">Daily Demand (d)</label>
              <input className="ac-input" type="number" placeholder="e.g. 20" />
            </div>
            <div className="ac-input-group">
              <label className="ac-label">Lead Time (L)</label>
              <input className="ac-input" type="number" placeholder="e.g. 7" />
            </div>
            <div className="ac-input-group">
              <label className="ac-label">Safety Stock (SS)</label>
              <input className="ac-input" type="number" placeholder="e.g. 30" />
            </div>
            <button className="ac-btn-compute">Compute B</button>
            <div className="ac-compare-result">170.00 units</div>
          </div>
        </div>
      )}

      {showModal && <AddFormulaModal onClose={() => setShowModal(false)} />}
      {showHistory && <HistoryPanel onClose={() => setShowHistory(false)} />}
      {showBatch && <BatchComputeModal onClose={() => setShowBatch(false)} />}
    </div>
  );
}