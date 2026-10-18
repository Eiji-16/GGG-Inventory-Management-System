import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Calculator, History, Download, TrendingUp, Boxes } from 'lucide-react';
import './autoCal.css';
import apiFetch from '../../apiFetch';
import exportReportWorkbook from '../../utils/exportReportWorkbook';
import {
  maximumInventoryFor,
  policyFor,
  reorderPointFor,
  SAFETY_STOCK_DEFAULTS,
} from '../../data/safetyStock';

const ORDER_QUANTITY_FORMULA = {
  fullName: 'Economic Order Quantity',
  description: 'Computes the optimal order quantity to minimize total inventory costs including ordering and holding costs.',
  formula: '√[(2 × annual demand × ordering cost) ÷ holding cost]',
  fields: [
    { key: 'demand',      label: 'Annual Demand',  placeholder: '', unit: 'units/year' },
    { key: 'orderCost',   label: 'Ordering Cost',  placeholder: '', unit: '₱ per order' },
    { key: 'holdingCost', label: 'Holding Cost', placeholder: '', unit: '₱ per unit/year' },
  ],
};

const calculateOrderQuantity = (annualDemand, orderingCost, holdingCost) => {
  const economicOrderQuantity = Math.sqrt((2 * annualDemand * orderingCost) / holdingCost);
  const annualOrdering = (annualDemand / economicOrderQuantity) * orderingCost;
  const annualHolding = (economicOrderQuantity / 2) * holdingCost;

  return {
    economicOrderQuantity,
    annualOrdering,
    annualHolding,
    totalCost: annualOrdering + annualHolding,
    annualOrders: annualDemand / economicOrderQuantity,
    annualDemand,
    orderingCost,
    holdingCost,
  };
};

/* ===== HISTORY SIDE PANEL ===== */
function HistoryPanel({ onClose, history, onClear }) {
  const fullHistoryName = (name) => name === 'EOQ' ? 'Economic Order Quantity' : name;
  const fullInputName = (name) => ({
    D: 'Annual Demand',
    S: 'Ordering Cost',
    H: 'Holding Cost',
  }[name] || name);

  return createPortal(
    <div className="ac-modal-overlay" onClick={onClose}>
      <div className="ac-modal ac-modal-wide" onClick={e => e.stopPropagation()}>
        <div className="ac-modal-header">
          <h3 className="ac-modal-title">Economic Order Quantity Calculation History</h3>
          <button className="ac-modal-close" onClick={onClose}><X size={14} /></button>
        </div>
        <div className="ac-modal-body">
          {history.length === 0 ? (
            <p className="ac-source-note" style={{ textAlign: 'center', padding: '20px 0' }}>
              No calculations yet. Compute an economic order quantity and it will be logged here.
            </p>
          ) : (
            <div className="ac-history-list">
              {history.map((h, i) => (
                <div className="ac-history-item" key={i}>
                  <div className="ac-history-top">
                    <span className="ac-history-formula">{fullHistoryName(h.formulaName)}</span>
                    <span className="ac-history-date">{h.date}</span>
                  </div>
                  <div className="ac-history-inputs">
                    {Object.entries(h.inputs).map(([k, v]) => (
                      <span key={k} className="ac-history-input-chip">{fullInputName(k)}: {v}</span>
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
export default function AutoCalculatorDesign({
  onNavigate,
  handoff,
  safetyStock = SAFETY_STOCK_DEFAULTS,
  catalogRevision = 0,
}) {
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
  const selectedPolicy = selectedProduct
    ? policyFor({
        productId: selectedProduct.id,
        productName: selectedProduct.name,
      }, safetyStock)
    : {};
  const reorderDemand = inputs.demand || selectedProduct?.annualDemand || selectedProduct?.demandFromHistory;
  const reorderPoint = selectedProduct
    ? reorderPointFor({
        productId: selectedProduct.id,
        productName: selectedProduct.name,
        safetyStock: selectedProduct.safetyStock,
        annualDemand: reorderDemand,
        leadTimeDays: selectedProduct.leadTimeDays,
      }, safetyStock)
    : null;
  const maximumInventory = selectedProduct
    ? maximumInventoryFor(
        reorderDemand,
        selectedProduct.safetyStock ?? selectedPolicy.safetyStock,
        selectedPolicy.leadTimeDays ?? selectedProduct.leadTimeDays,
        selectedPolicy.orderCycleDays ?? selectedProduct.orderCycleDays,
      )
    : null;
  const currentStock = selectedProduct ? Number(selectedProduct.stock ?? 0) : null;
  const reorderRequired = reorderPoint !== null && currentStock !== null && currentStock <= reorderPoint;
  const annualDemandForCalculation = Number(reorderDemand);
  const orderingCostForCalculation = Number(
    inputs.orderCost !== '' ? inputs.orderCost : selectedPolicy.orderingCost ?? selectedProduct?.orderingCost
  );
  const holdingCostForCalculation = Number(
    inputs.holdingCost !== '' ? inputs.holdingCost : selectedPolicy.holdingCost ?? selectedProduct?.holdingCost
  );
  const automaticResult = reorderRequired
    && annualDemandForCalculation > 0
    && orderingCostForCalculation > 0
    && holdingCostForCalculation > 0
    ? calculateOrderQuantity(
      annualDemandForCalculation,
      orderingCostForCalculation,
      holdingCostForCalculation,
    )
    : null;
  const displayResult = reorderRequired ? automaticResult : result;

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
        if (active) setProductsError('Products could not be loaded. You can still enter the calculation inputs manually.');
      } finally {
        if (active) setProductsLoading(false);
      }
    };

    loadProducts();
    return () => { active = false; };
  }, [productsRetry, catalogRevision]);

  useEffect(() => {
    if (selectedProductId && !products.some((product) => String(product.id) === String(selectedProductId))) {
      setSelectedProductId('');
      setInputs({ demand: '', orderCost: '', holdingCost: '' });
      setResult(null);
      setSaveStatus('');
    }
  }, [products, selectedProductId]);

  useEffect(() => {
    if (!selectedProduct) return;
    setInputs((previous) => {
      const orderCost = String(
        selectedPolicy.orderingCost ?? selectedProduct.orderingCost ?? previous.orderCost
      );
      const holdingCost = String(
        selectedPolicy.holdingCost ?? selectedProduct.holdingCost ?? previous.holdingCost
      );
      if (orderCost === previous.orderCost && holdingCost === previous.holdingCost) return previous;
      return {
        ...previous,
        orderCost: String(orderCost),
        holdingCost: String(holdingCost),
      };
    });
  }, [
    selectedProduct,
    selectedPolicy.orderingCost,
    selectedPolicy.holdingCost,
  ]);

  useEffect(() => {
    if (!handoff?.productId || !products.length) return;
    const product = products.find(item => String(item.id) === String(handoff.productId));
    if (!product) return;
    const productPolicy = policyFor({
      productId: product.id,
      productName: product.name,
    }, safetyStock);

    setSelectedProductId(product.id);
    setInputs({
      demand: String(handoff.annualDemand ?? ''),
      orderCost: String(product.orderingCost ?? productPolicy.orderingCost ?? ''),
      holdingCost: String(product.holdingCost ?? productPolicy.holdingCost ?? ''),
    });
    setErrors(prev => ({ ...prev, demand: '' }));
    setResult(null);
    setSaveStatus('');
  }, [handoff, products, safetyStock]);

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
    const productPolicy = p
      ? policyFor({ productId: p.id, productName: p.name }, safetyStock)
      : {};
    setInputs({
      demand: String(demandValue),
      orderCost: String(p?.orderingCost ?? productPolicy.orderingCost ?? ''),
      holdingCost: String(p?.holdingCost ?? productPolicy.holdingCost ?? ''),
    });
    setErrors(prev => ({ ...prev, demand: '' }));
    setResult(null);
    setSaveStatus('');
  };

  /* Persist a computation (with "computed by") so it appears in Reports. */
  const saveCalculation = async (formulaName, resultValue, unit, numericInputs) => {
    const product = products.find(pr => String(pr.id) === String(selectedProductId));
    const response = await apiFetch('/calculations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
    ORDER_QUANTITY_FORMULA.fields.forEach(field => {
      const value = parseFloat(inputs[field.key]);
      if (inputs[field.key] === '' || inputs[field.key] == null || isNaN(value) || value < 0) {
        errs[field.key] = `Enter a valid ${field.label}`;
      }
    });
    if (Object.keys(errs).length) { setErrors(errs); return; }

    const annualDemand = parseFloat(inputs.demand);
    const orderingCost = parseFloat(inputs.orderCost);
    const holdingCost = parseFloat(inputs.holdingCost);
    if (!(annualDemand > 0 && orderingCost > 0 && holdingCost > 0)) {
      setErrors({
        demand: annualDemand > 0 ? '' : 'Enter a positive annual demand',
        orderCost: orderingCost > 0 ? '' : 'Enter a positive ordering cost',
        holdingCost: holdingCost > 0 ? '' : 'Enter a positive holding cost',
      });
      return;
    }
    const calculation = calculateOrderQuantity(annualDemand, orderingCost, holdingCost);
    setResult(calculation);
    setHistory(prev => [{
      formulaName: 'Economic Order Quantity',
      date: new Date().toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }),
      inputs: {
        'Annual Demand': annualDemand,
        'Ordering Cost': orderingCost,
        'Holding Cost': holdingCost,
      },
      result: calculation.economicOrderQuantity.toFixed(2),
      unit: 'units',
    }, ...prev]);
    setSaving(true);
    setSaveStatus('');
    try {
      await saveCalculation('EOQ', Number(calculation.economicOrderQuantity.toFixed(2)), 'units', {
        annualDemand,
        orderingCost,
        holdingCost,
        annualOrders: Number(calculation.annualOrders.toFixed(2)),
      });
      setSaveStatus('Calculation saved to Economic Order Quantity reports.');
    } catch {
      setSaveStatus('The result is available, but it could not be saved to reports. Please try again.');
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

  const reportGeneratedAt = () => new Date().toLocaleString('en-PH', {
    dateStyle: 'long',
    timeStyle: 'short',
  });

  /* ===== REPORT EXPORTS ===== */
  const exportExcel = async () => {
    if (!displayResult) return;
    setSaveStatus('');
    try {
      await exportReportWorkbook({
        title: 'Economic Order Quantity Report',
        subtitle: `Inventory order planning for ${selectedProduct?.name || 'manual calculation'}`,
        fileName: `eoq-report-${selectedProduct?.id || 'manual-calculation'}`,
        summary: [
          { label: 'Recommended order quantity', value: `${fmtNum(displayResult.economicOrderQuantity)} units` },
          { label: 'Orders per year', value: fmtNum(displayResult.annualOrders) },
          { label: 'Total annual cost', value: fmtCur(displayResult.totalCost) },
        ],
        sections: [
          {
            title: 'Calculation inputs',
            headers: ['Input', 'Value', 'Unit'],
            rows: [
              ['Annual demand', fmtNum(displayResult.annualDemand), 'units/year'],
              ['Ordering cost', fmtCur(displayResult.orderingCost), 'PHP/order'],
              ['Holding cost', fmtCur(displayResult.holdingCost), 'PHP/unit/year'],
            ],
          },
          {
            title: 'Inventory position',
            headers: ['Metric', 'Value', 'Unit'],
            rows: selectedProduct
              ? [
                ['Current stock', currentStock, 'units'],
                ['Reorder point', reorderPoint, 'units'],
                ...(maximumInventory === null ? [] : [['Maximum inventory', maximumInventory, 'units']]),
              ]
              : [['Inventory position', 'Not linked to a selected product', '']],
          },
          {
            title: 'EOQ results',
            headers: ['Result', 'Value', 'Unit'],
            rows: [
              ['Economic order quantity', fmtNum(displayResult.economicOrderQuantity), 'units/order'],
              ['Orders per year', fmtNum(displayResult.annualOrders), 'orders/year'],
              ['Annual ordering cost', fmtCur(displayResult.annualOrdering), 'PHP/year'],
              ['Annual holding cost', fmtCur(displayResult.annualHolding), 'PHP/year'],
              ['Total annual inventory cost', fmtCur(displayResult.totalCost), 'PHP/year'],
            ],
          },
        ],
        scope: `Formula: ${ORDER_QUANTITY_FORMULA.formula}`,
        note: 'This is a planning recommendation, not a purchase order. Verify costs and supplier availability before ordering.',
        columnWidths: [34, 28, 22],
      });
    } catch (error) {
      console.error('Could not export Economic Order Quantity report:', error);
      setSaveStatus('The report could not be exported. Please try again.');
    }
  };

  /* Opens a formatted report for printing or saving as PDF. */
  const exportPdf = () => {
    if (!displayResult) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      setSaveStatus('The report could not be opened. Allow pop-ups, then try exporting again.');
      return;
    }

    const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[character]));
    const generatedAt = reportGeneratedAt();
    const productName = selectedProduct?.name || 'Manual calculation';
    const inventoryRows = selectedProduct
      ? [
        ['Current stock', `${currentStock} units`],
        ['Reorder point', `${reorderPoint} units`],
        ...(maximumInventory === null ? [] : [['Maximum inventory', `${maximumInventory} units`]]),
      ]
      : [['Inventory position', 'Not linked to a selected product']];
    const inputRows = [
      ['Annual demand', `${fmtNum(displayResult.annualDemand)} units/year`],
      ['Ordering cost', fmtCur(displayResult.orderingCost)],
      ['Holding cost', `${fmtCur(displayResult.holdingCost)} per unit/year`],
    ];
    const resultRows = [
      ['Orders per year', `${fmtNum(displayResult.annualOrders)} orders`],
      ['Annual ordering cost', fmtCur(displayResult.annualOrdering)],
      ['Annual holding cost', fmtCur(displayResult.annualHolding)],
      ['Total annual inventory cost', fmtCur(displayResult.totalCost)],
    ];
    const renderRows = (rows) => rows.map(([label, value]) => (
      `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`
    )).join('');

    printWindow.document.write(`<!doctype html>
      <html lang="en">
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <title>EOQ Report - ${escapeHtml(productName)}</title>
          <style>
            * { box-sizing: border-box; }
            body { margin: 0; padding: 40px; color: #172033; font: 14px/1.5 Arial, sans-serif; }
            main { max-width: 760px; margin: 0 auto; }
            header { display: flex; justify-content: space-between; gap: 24px; padding-bottom: 22px; border-bottom: 3px solid #176b57; }
            .brand { color: #176b57; font-size: 13px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
            h1 { margin: 7px 0 4px; font-size: 25px; }
            .muted { color: #667085; font-size: 12px; }
            .report-meta { text-align: right; }
            .hero { margin: 24px 0; padding: 22px; border-radius: 12px; background: #f0f7f4; }
            .hero-label { color: #52635d; font-size: 12px; font-weight: 700; text-transform: uppercase; }
            .hero-value { margin: 4px 0; color: #176b57; font-size: 38px; font-weight: 700; }
            .hero-value small { font-size: 16px; font-weight: 500; }
            .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 22px; }
            section { margin-bottom: 20px; }
            h2 { margin: 0 0 8px; font-size: 14px; }
            table { width: 100%; border-collapse: collapse; }
            th, td { padding: 8px 4px; border-bottom: 1px solid #e5e9ed; text-align: left; font-size: 12px; }
            th { color: #667085; font-weight: 500; }
            td { text-align: right; font-weight: 600; }
            .formula { padding: 12px; border: 1px solid #e5e9ed; border-radius: 8px; background: #fafbfc; }
            footer { margin-top: 16px; padding-top: 12px; border-top: 1px solid #e5e9ed; color: #667085; font-size: 11px; }
            @media print { body { padding: 18mm; } }
            @media (max-width: 600px) { body { padding: 20px; } .grid { grid-template-columns: 1fr; } header { flex-direction: column; } .report-meta { text-align: left; } }
          </style>
        </head>
        <body>
          <main>
            <header>
              <div>
                <div class="brand">GGG Inventory Management System</div>
                <h1>Economic Order Quantity Report</h1>
                <div class="muted">Product: ${escapeHtml(productName)}</div>
              </div>
              <div class="report-meta muted">Generated<br><strong>${escapeHtml(generatedAt)}</strong></div>
            </header>
            <div class="hero">
              <div class="hero-label">Recommended order quantity</div>
              <div class="hero-value">${escapeHtml(fmtNum(displayResult.economicOrderQuantity))} <small>units per order</small></div>
              <div class="muted">Based on the demand and cost values shown in this report.</div>
            </div>
            <div class="grid">
              <section><h2>Calculation inputs</h2><table>${renderRows(inputRows)}</table></section>
              <section><h2>Inventory position</h2><table>${renderRows(inventoryRows)}</table></section>
            </div>
            <section><h2>Annual cost and order plan</h2><table>${renderRows(resultRows)}</table></section>
            <section>
              <h2>Formula</h2>
              <div class="formula">EOQ = √[(2 × annual demand × ordering cost) ÷ holding cost]<br><span class="muted">Entered values are used as provided; verify that costs and demand reflect current business data.</span></div>
            </section>
            <footer>This report is a planning recommendation only. It does not create or place a purchase order. Confirm supplier availability and actual costs before ordering.</footer>
          </main>
          <script>window.addEventListener('load', () => { window.focus(); window.print(); });</script>
        </body>
      </html>`);
    printWindow.document.close();
  };

  return (
    <div className="ac-root">
      {/* Header */}
      <div className="ac-header">
        <div className="ac-page-heading">
          <h1>Auto-Calculator</h1>
        </div>
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
          <div>
            <span>
              Forecast received for <strong>{handoff.product}</strong> — annual demand is pre-filled with{' '}
              <strong>{Number(handoff.annualDemand).toLocaleString()} units/year</strong>.
            </span>
            <small>For an accurate calculation, enter this product’s actual ordering cost and holding cost. The calculator will not estimate missing costs.</small>
          </div>
        </div>
      )}

      {/* ===== CALCULATOR BODY ===== */}
      <div className="ac-workspace">
        <section className="ac-panel ac-input-panel" aria-labelledby="ac-input-title">
          <div className="ac-panel-heading">
            <h2 id="ac-input-title">Inputs</h2>
            <span className="ac-formula-expr"><Calculator size={12} />{ORDER_QUANTITY_FORMULA.formula}</span>
          </div>
          <p className="ac-source-note ac-panel-description">{ORDER_QUANTITY_FORMULA.description}</p>
          {handoff && (
            <div className="ac-cost-input-notice" role="status">
              {inputs.orderCost && inputs.holdingCost
                ? 'Both cost inputs are filled. Check that these are the actual costs for this product before computing.'
                : `Still needed: ${[
                  !inputs.orderCost && 'ordering cost per order',
                  !inputs.holdingCost && 'holding cost per unit/year',
                ].filter(Boolean).join(' and ')}.`}
            </div>
          )}

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
                  <span>Reorder point: <strong>{reorderPoint} units</strong></span>
                  {maximumInventory !== null && (
                    <span>Maximum inventory: <strong>{maximumInventory} units</strong></span>
                  )}
                  <span>Current stock: <strong>{currentStock} units</strong></span>
                </div>
                <span className="ac-reorder-status-message">
                  {reorderRequired ? 'Reorder trigger reached.' : 'Stock is above the reorder point.'}
                  {' '}The reorder point is safety stock plus demand during lead time. The economic order quantity calculates how much to order.
                </span>
                {reorderRequired && (
                  <span className="ac-reorder-status-message">
                    {automaticResult
                      ? 'An order-quantity recommendation has been calculated automatically from this product’s policy.'
                      : 'Set annual demand, ordering cost, and holding cost in Settings → Advanced Options to calculate automatically.'}
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="ac-inputs-grid">
            {ORDER_QUANTITY_FORMULA.fields.map((field) => (
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
              {saving ? 'Saving…' : 'Calculate Order Quantity'}
            </button>
            <button className="ac-btn-reset" onClick={handleReset} type="button" disabled={saving}>Reset</button>
          </div>
        </section>

        <section className="ac-panel ac-result-panel" aria-labelledby="ac-result-title">
          <div className="ac-panel-heading">
            <h2 id="ac-result-title">Computation Result</h2>
            <span className="ac-result-section-label">{ORDER_QUANTITY_FORMULA.fullName}</span>
          </div>
          <div className="ac-result-main">
            <div key={displayResult ? `order-quantity-${displayResult.economicOrderQuantity}` : 'order-quantity-empty'} className={`ac-result-value${displayResult ? ' has-result' : ''}`}>
              {displayResult ? fmtNum(displayResult.economicOrderQuantity) : '—'}
            </div>
            <div className="ac-result-unit">
              {displayResult ? 'units per order' : 'Calculate the recommended order quantity'}
            </div>
          </div>
          <div className="ac-metrics-grid">
            <div className="ac-metric-card">
              <span className="ac-metric-label">Annual Ordering Cost</span>
              <span className="ac-metric-value">{displayResult ? fmtCur(displayResult.annualOrdering) : '—'}</span>
            </div>
            <div className="ac-metric-card">
              <span className="ac-metric-label">Annual Holding Cost</span>
              <span className="ac-metric-value">{displayResult ? fmtCur(displayResult.annualHolding) : '—'}</span>
            </div>
            <div className="ac-metric-card ac-metric-card-accent">
              <span className="ac-metric-label">Total Annual Cost</span>
              <span className="ac-metric-value">{displayResult ? fmtCur(displayResult.totalCost) : '—'}</span>
            </div>
            <div className="ac-metric-card">
              <span className="ac-metric-label">Orders per Year</span>
              <span className="ac-metric-value">
                {displayResult ? fmtNum(displayResult.annualOrders) : '—'}
              </span>
            </div>
          </div>
          <div className="ac-export-actions">
            <button className="ac-btn-reset ac-export-btn" onClick={exportExcel} disabled={!displayResult} type="button">
              <Download size={13} /> Export Excel
            </button>
            <button className="ac-btn-reset ac-export-btn" onClick={exportPdf} disabled={!displayResult} type="button">
              <Download size={13} /> Export PDF
            </button>
          </div>
          {saveStatus && (
            <p className={`ac-save-status${saveStatus.startsWith('The result') || saveStatus.startsWith('The report') ? ' is-error' : ''}`} role={saveStatus.startsWith('The result') || saveStatus.startsWith('The report') ? 'alert' : 'status'} aria-live="polite">
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
