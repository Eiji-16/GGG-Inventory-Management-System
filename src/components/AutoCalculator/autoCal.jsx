import React, { useState } from 'react';
import { Plus, X, Calculator } from 'lucide-react';
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
];

// Modal for adding new formula
function AddFormulaModal({ onClose, onSave }) {
  const [name, setName] = useState('');
  const [fullName, setFullName] = useState('');
  const [description, setDescription] = useState('');
  const [formula, setFormula] = useState('');
  const [fields, setFields] = useState([
    { key: '', label: '', unit: '' },
  ]);

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
      compute: () => null, // user-defined formula — result shown as manual
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

function AutoCalculator({ onNavigate }) {
  const [formulas, setFormulas] = useState(DEFAULT_FORMULAS);
  const [activeId, setActiveId] = useState('eoq');
  const [values, setValues] = useState({});
  const [result, setResult] = useState(null);
  const [showModal, setShowModal] = useState(false);

  const active = formulas.find(f => f.id === activeId);

  function handleCompute() {
    if (!active) return;
    const res = active.compute(values);
    setResult(res);
  }

  function handleReset() {
    setValues({});
    setResult(null);
  }

  function handleTabChange(id) {
    setActiveId(id);
    setValues({});
    setResult(null);
  }

  function handleAddFormula(f) {
    setFormulas(prev => [...prev, f]);
    setActiveId(f.id);
    setValues({});
    setResult(null);
  }

  function handleDeleteFormula(id) {
    if (id === 'eoq') return; // protect default
    setFormulas(prev => prev.filter(f => f.id !== id));
    setActiveId('eoq');
    setValues({});
    setResult(null);
  }

  return (
    <div className="ac-root">

      {/* Header */}
      <div className="ac-header">
        <div>
          
        </div>
        <button className="ac-add-btn" onClick={() => setShowModal(true)}>
          <Plus size={13} /> Add Formula
        </button>
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

      {/* Calculator Body */}
      {active && (
        <div className="ac-body">

          {/* Left — Inputs */}
          <div className="ac-left">
            <div className="ac-formula-info">
              <div className="ac-formula-name">{active.fullName}</div>
              {active.description && (
                <p className="ac-formula-desc">{active.description}</p>
              )}
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

          {/* Right — Result */}
          <div className="ac-right">
            <div className="ac-result-box">
              <div className="ac-result-section">
                <div className="ac-result-section-label">Formula</div>
                <div className="ac-result-formula">
                  {active.formula || 'User-defined formula'}
                </div>
              </div>
              <div className="ac-result-divider" />
              <div className="ac-result-section">
                <div className="ac-result-section-label">
                  {result ? result.label : 'Result'}
                </div>
                <div className={`ac-result-value ${result ? 'has-result' : ''}`}>
                  {result ? `${result.value}` : '—'}
                </div>
                {result && (
                  <div className="ac-result-unit">{result.unit}</div>
                )}
              </div>
              {result && (
                <div className="ac-result-hint">
                  ✅ You should order <strong>{result.value} {result.unit}</strong> per order cycle.
                </div>
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

      {/* Add Formula Modal */}
      {showModal && (
        <AddFormulaModal
          onClose={() => setShowModal(false)}
          onSave={handleAddFormula}
        />
      )}

    </div>
  );
}

export default AutoCalculator;
