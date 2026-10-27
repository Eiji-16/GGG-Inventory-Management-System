import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, History, Download, TrendingUp, Calculator, Info, Lock } from 'lucide-react';
import './autoCal.css';
import apiFetch from '../../apiFetch';
import exportReportWorkbook from '../../utils/exportReportWorkbook';
import { useCurrency } from '../../CurrencyContext';
import {
  DEFAULT_SAFETY_STOCK,
  policyFor,
  safetyPointFor,
  SAFETY_STOCK_DEFAULTS,
} from '../../data/safetyStock';

/* ==========================================================================
   ECONOMIC ORDER QUANTITY CALCULATOR (Figure 10)
   EOQ = √(2 × D × S ÷ H)
     D = annual demand (units/year)      — from the forecast or past 12 months
     S = ordering cost (per order)       — entered by the owner
     H = holding cost (per unit / year)  — entered by the owner
   Reorder point = safety stock + (D ÷ 365 × lead time in days)
   ========================================================================== */

const EOQ_FORMULA = '√(2 × annual demand × ordering cost ÷ holding cost)';
const EMPTY_INPUTS = { demand: '', orderCost: '', holdingCost: '', leadTime: '', safetyStock: '' };
const INPUT_KEYS = Object.keys(EMPTY_INPUTS);

const calculatorDraftStorageKey = (userId) => `ggg-inventory-eoq-calculator:${userId || 'default'}`;

const readCalculatorDraft = (userId) => {
  if (typeof window === 'undefined') return null;
  try {
    const saved = window.localStorage.getItem(calculatorDraftStorageKey(userId));
    if (!saved) return null;
    const draft = JSON.parse(saved);
    if (!draft || typeof draft !== 'object') return null;
    const inputs = draft.inputs && typeof draft.inputs === 'object' ? draft.inputs : {};
    const history = Array.isArray(draft.history)
      ? draft.history.filter((item) => item && typeof item === 'object'
        && typeof item.formulaName === 'string'
        && typeof item.date === 'string'
        && item.inputs && typeof item.inputs === 'object'
        && Number.isFinite(item.result)
        && typeof item.unit === 'string')
      : [];
    return {
      selectedProductId: typeof draft.selectedProductId === 'string' ? draft.selectedProductId : '',
      inputs: Object.fromEntries(INPUT_KEYS.map((key) => [key, typeof inputs[key] === 'string' ? inputs[key] : ''])),
      history,
    };
  } catch (error) {
    console.error('Could not restore the Economic Order Quantity Calculator draft:', error);
    return null;
  }
};

/** Pure EOQ math — every value shown on screen comes from here. */
export const calculateOrderQuantity = ({ annualDemand, orderingCost, holdingCost, leadTimeDays = 0, safetyStock = 0 }) => {
  const economicOrderQuantity = Math.sqrt((2 * annualDemand * orderingCost) / holdingCost);
  const annualOrders = annualDemand / economicOrderQuantity;
  const annualOrdering = annualOrders * orderingCost;
  const annualHolding = (economicOrderQuantity / 2) * holdingCost;
  const dailyDemand = annualDemand / 365;
  const leadTimeDemand = dailyDemand * leadTimeDays;
  return {
    economicOrderQuantity,
    recommendedOrder: Math.max(1, Math.round(economicOrderQuantity)),
    annualOrders,
    annualOrdering,
    annualHolding,
    totalCost: annualOrdering + annualHolding,
    dailyDemand,
    leadTimeDemand,
    reorderPoint: Math.ceil(safetyStock + leadTimeDemand),
    daysBetweenOrders: 365 / annualOrders,
    annualDemand,
    orderingCost,
    holdingCost,
    leadTimeDays,
    safetyStock,
  };
};

const sameInputs = (a, b) => INPUT_KEYS.every((key) => String(a?.[key] ?? '') === String(b?.[key] ?? ''));

/* ===== HISTORY SIDE PANEL ===== */
/* Short labels for the saved inputs (older entries keep the same keys). */
const HISTORY_FIELDS = [
  { key: 'Annual demand', label: 'Demand', suffix: '/yr' },
  { key: 'Ordering cost', label: 'Order cost', money: true },
  { key: 'Holding cost', label: 'Holding', money: true },
  { key: 'Lead time (days)', label: 'Lead time', suffix: ' d' },
  { key: 'Safety stock', label: 'Safety', suffix: '' },
];

function HistoryPanel({ onClose, history, onClear }) {
  const { formatCurrency } = useCurrency();
  const show = (field, value) => {
    if (value === '' || value == null) return '—';
    if (field.money) return formatCurrency(value);
    return `${Number(value).toLocaleString('en-PH')}${field.suffix || ''}`;
  };
  return createPortal(
    <div className="ac-modal-overlay" onClick={onClose}>
      <div className="ac-modal ac-modal-wide ac-history-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="ac-history-title">
        <div className="ac-modal-header">
          <div className="ac-history-head">
            <span className="ac-history-head-icon" aria-hidden="true"><History size={16} /></span>
            <div>
              <h3 className="ac-modal-title" id="ac-history-title">Calculation History</h3>
              <p className="ac-history-sub">
                {history.length ? `${history.length} calculation${history.length === 1 ? '' : 's'} · saved in this browser` : 'Saved in this browser'}
              </p>
            </div>
          </div>
          <button className="ac-modal-close" onClick={onClose} aria-label="Close history"><X size={14} /></button>
        </div>
        <div className="ac-modal-body">
          {history.length === 0 ? (
            <div className="ac-history-empty">
              <span className="ac-history-head-icon" aria-hidden="true"><Calculator size={18} /></span>
              <strong>No calculations yet</strong>
              <span>Each “Compute Order Quantity” appears here and is saved to Reports.</span>
            </div>
          ) : (
            <div className="ac-history-list">
              {history.map((h, i) => (
                <article className="ac-history-item" key={i}>
                  <div className="ac-history-qty" title="Economic order quantity">
                    <strong>{Math.round(Number(h.result)).toLocaleString('en-PH')}</strong>
                    <span>{h.unit || 'units'} / order</span>
                  </div>
                  <div className="ac-history-main">
                    <div className="ac-history-top">
                      <span className="ac-history-formula">{h.product || h.formulaName}</span>
                      <span className="ac-history-date">{h.date}</span>
                    </div>
                    <dl className="ac-history-stats">
                      {HISTORY_FIELDS.filter((field) => field.key in (h.inputs || {})).map((field) => (
                        <div key={field.key}>
                          <dt>{field.label}</dt>
                          <dd>{show(field, h.inputs[field.key])}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
        <div className="ac-modal-footer ac-history-footer">
          <span className="ac-history-note">Every calculation is also in Reports → Economic Order Quantity Calculator Summary.</span>
          <button className="ac-btn-cancel ac-history-clear" onClick={onClear} disabled={history.length === 0}>Clear history</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

/* ===== ONE LABELLED INPUT WITH A HINT ===== */
function Field({ id, label, hint, prefix, suffix, error, tag, children, ...inputProps }) {
  return (
    <div className="eq-field">
      <div className="eq-label-row">
        <label htmlFor={id}>{label}</label>
        {tag}
      </div>
      <div className={`eq-input-wrap${error ? ' has-error' : ''}`}>
        {prefix && <span className="eq-affix">{prefix}</span>}
        <input id={id} type="number" min="0" step="any" inputMode="decimal" {...inputProps} />
        {suffix && <span className="eq-affix eq-suffix">{suffix}</span>}
      </div>
      {error ? <span className="eq-error" role="alert">{error}</span> : hint && <span className="eq-hint">{hint}</span>}
      {children}
    </div>
  );
}

/* ===== MAIN COMPONENT ===== */
export default function AutoCalculatorDesign({
  onNavigate,
  handoff,
  onClearHandoff,
  currentUser = '',
  currentUserId = '',
  safetyStock = SAFETY_STOCK_DEFAULTS,
  catalogRevision = 0,
  // Role Access (Settings) decides these; the server checks the same boxes.
  allowSaveCosts = true,
  canViewHistory = true,
  canExport = true,
  canOpenForecasting = true,
}) {
  const { currency, currencySymbol, formatCurrency } = useCurrency();
  const [savedDraft] = useState(() => readCalculatorDraft(currentUserId));
  const [showHistory, setShowHistory] = useState(false);
  // Results open in a pop-up (no empty result panel taking space on the page).
  const [showResult, setShowResult] = useState(false);

  const [products, setProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [productsError, setProductsError] = useState('');
  const [productsRetry, setProductsRetry] = useState(0);
  const [selectedProductId, setSelectedProductId] = useState(savedDraft?.selectedProductId || '');
  const [forecastContext, setForecastContext] = useState(null);
  const [demandSource, setDemandSource] = useState('manual'); // forecast | history | manual
  const [forecastFallback, setForecastFallback] = useState('');
  const [inputs, setInputs] = useState(savedDraft?.inputs || EMPTY_INPUTS);
  const [errors, setErrors] = useState({});
  const [result, setResult] = useState(null);
  const [resultInputs, setResultInputs] = useState(null);
  const [saveStatus, setSaveStatus] = useState({ type: '', text: '' });
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState(savedDraft?.history || []);
  const [unitCost, setUnitCost] = useState('');
  const [showEstimator, setShowEstimator] = useState(false);
  const [costSave, setCostSave] = useState({ state: 'idle', text: '' });

  const selectedProduct = products.find((product) => String(product.id) === String(selectedProductId)) || null;
  const activeForecastContext = forecastContext
    && String(forecastContext.productId) === String(selectedProductId)
    && Number(inputs.demand) === Number(forecastContext.annualDemand)
    ? forecastContext
    : null;
  const resultIsStale = Boolean(result && !sameInputs(inputs, resultInputs));
  const currentStock = selectedProduct ? Number(selectedProduct.stock ?? 0) : null;

  useEffect(() => {
    try {
      window.localStorage.setItem(calculatorDraftStorageKey(currentUserId), JSON.stringify({ selectedProductId, inputs, history }));
    } catch (error) {
      console.error('Could not save the Economic Order Quantity Calculator draft:', error);
    }
  }, [currentUserId, history, inputs, selectedProductId]);

  /* Products for the picker and for auto-filling demand, costs, lead time and safety stock. */
  useEffect(() => {
    let active = true;
    setProductsLoading(true);
    setProductsError('');
    fetch('/api/products', { cache: 'no-store', headers: { Accept: 'application/json' } })
      .then((response) => {
        if (!response.ok) throw new Error('Unable to load products.');
        return response.json();
      })
      .then((data) => {
        if (!Array.isArray(data)) throw new Error('The products response was invalid.');
        if (active) setProducts(data);
      })
      .catch(() => { if (active) setProductsError('Products could not be loaded. You can still type the inputs yourself.'); })
      .finally(() => { if (active) setProductsLoading(false); });
    return () => { active = false; };
  }, [productsRetry, catalogRevision]);

  /** Everything a product can pre-fill, from the forecast handoff or its own records. */
  const defaultsFor = (product, demandOverride) => {
    const policy = policyFor({ productId: product.id, productName: product.name }, safetyStock);
    const historyDemand = Number(product.demandFromHistory) > 0 ? product.demandFromHistory : (product.annualDemand || 0);
    const leadTime = policy.leadTimeDays !== '' && policy.leadTimeDays != null ? policy.leadTimeDays : product.leadTimeDays;
    return {
      demand: String(demandOverride ?? historyDemand ?? ''),
      orderCost: String(product.orderingCost ?? policy.orderingCost ?? ''),
      holdingCost: String(product.holdingCost ?? policy.holdingCost ?? ''),
      leadTime: leadTime === null || leadTime === undefined || leadTime === '' ? '' : String(leadTime),
      safetyStock: String(safetyPointFor({ productId: product.id, productName: product.name, safetyStock: product.safetyStock }, safetyStock) ?? DEFAULT_SAFETY_STOCK),
    };
  };

  /* ===== LOCKED POLICY FIELDS =====
     With a product selected, Lead Time and Safety Stock come from the Super
     Admin's Safety Stock Policy (Settings), so they can't be typed over here.
     Lead Time stays editable only when the product has none set anywhere. */
  const policyValues = selectedProduct ? defaultsFor(selectedProduct) : null;
  const leadTimeLocked = Boolean(policyValues && policyValues.leadTime !== '');
  const safetyStockLocked = Boolean(policyValues);
  useEffect(() => {
    if (!policyValues) return;
    setInputs((prev) => {
      const next = {
        ...prev,
        leadTime: leadTimeLocked ? policyValues.leadTime : prev.leadTime,
        safetyStock: policyValues.safetyStock,
      };
      return next.leadTime === prev.leadTime && next.safetyStock === prev.safetyStock ? prev : next;
    });
    // Re-run only when the policy values themselves change.
  }, [selectedProductId, policyValues?.leadTime, policyValues?.safetyStock, leadTimeLocked]);
  const lockedTag = (
    <span className="eq-lock" title="From the Safety Stock Policy (Settings) — set by the Super Admin">
      <Lock size={11} aria-hidden="true" />
      <span className="eq-sr">From policy</span>
    </span>
  );

  /* ===== SAVE COSTS AS PRODUCT DEFAULTS =====
     Ordering and holding cost used to be typed in Settings → Advanced. They
     are EOQ inputs, so they are saved here and pre-fill next time. */
  const savedCosts = selectedProduct
    && String(selectedProduct.orderingCost ?? '') !== ''
    && Number(selectedProduct.orderingCost) === Number(inputs.orderCost)
    && Number(selectedProduct.holdingCost) === Number(inputs.holdingCost);
  const canSaveCosts = Boolean(selectedProduct) && Number(inputs.orderCost) > 0 && Number(inputs.holdingCost) > 0 && !savedCosts;

  const saveCostDefaults = async () => {
    if (!canSaveCosts) return;
    setCostSave({ state: 'saving', text: '' });
    try {
      const response = await apiFetch(`/api/products/${encodeURIComponent(selectedProduct.id)}/eoq-costs`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ orderingCost: Number(inputs.orderCost), holdingCost: Number(inputs.holdingCost) }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = data.errors ? Object.values(data.errors).flat()[0] : data.message;
        throw new Error(message || `Could not save the costs (${response.status}).`);
      }
      setProducts((prev) => prev.map((product) => (String(product.id) === String(selectedProduct.id)
        ? { ...product, orderingCost: data.orderingCost, holdingCost: data.holdingCost }
        : product)));
      setCostSave({ state: 'saved', text: `Saved for ${selectedProduct.name}. They’ll fill in automatically next time.` });
    } catch (error) {
      setCostSave({ state: 'error', text: error.message || 'Could not save the costs.' });
    }
  };

  useEffect(() => { setCostSave({ state: 'idle', text: '' }); }, [selectedProductId]);

  const clearResult = () => {
    setResult(null);
    setResultInputs(null);
    setSaveStatus({ type: '', text: '' });
  };

  /* Handoffs: "Compute EOQ from Forecast" (type forecast-eoq) and "Order Now" /
     the Stock Control EOQ shortcut (productId only). */
  useEffect(() => {
    if (!handoff || productsLoading) return;
    const product = products.find((item) => String(item.id) === String(handoff.productId));
    if (!product) {
      if (handoff.productId) {
        setErrors({ demand: 'That product is no longer available. Select a current product.' });
      }
      onClearHandoff?.();
      return;
    }
    setForecastFallback(handoff.type === 'forecast-eoq' ? '' : (handoff.forecastUnavailable || ''));
    if (handoff.type === 'forecast-eoq') {
      setForecastContext(handoff);
      setDemandSource('forecast');
      setInputs(defaultsFor(product, handoff.annualDemand));
    } else {
      setForecastContext(null);
      const demand = Number(handoff.annualDemand) > 0 ? handoff.annualDemand : undefined;
      setDemandSource('history');
      setInputs(defaultsFor(product, demand));
      onClearHandoff?.();
    }
    setSelectedProductId(String(product.id));
    setErrors({});
    clearResult();
  }, [handoff, products, productsLoading]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setInputs((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => ({ ...prev, [name]: '' }));
    if (name === 'demand') {
      setDemandSource('manual');
      if (forecastContext) {
        setForecastContext(null);
        onClearHandoff?.();
      }
    }
  };

  const handleProductSelect = (e) => {
    setForecastContext(null);
    onClearHandoff?.();
    const id = e.target.value;
    setSelectedProductId(id);
    const product = products.find((p) => String(p.id) === String(id));
    setInputs(product ? defaultsFor(product) : EMPTY_INPUTS);
    setDemandSource(product ? 'history' : 'manual');
    setErrors({});
    clearResult();
  };

  /* Persist a computation (with "computed by") so it appears in Reports. */
  const saveCalculation = async (calculation) => {
    const response = await apiFetch('/calculations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        formula: 'EOQ',
        result: calculation.economicOrderQuantity,
        unit: 'units',
        productId: selectedProduct?.id || null,
        demandSource: activeForecastContext ? 'forecast' : 'historical',
        inputs: {
          annualDemand: calculation.annualDemand,
          orderingCost: calculation.orderingCost,
          holdingCost: calculation.holdingCost,
        },
        ...(activeForecastContext ? {
          forecast: {
            productId: activeForecastContext.productId,
            periodType: activeForecastContext.periodType,
            forecastPeriod: activeForecastContext.forecastPeriod,
            baseForecast: activeForecastContext.baseForecast,
            seasonalEnabled: activeForecastContext.seasonalEnabled,
            seasonalEvent: activeForecastContext.seasonalEvent,
            adjustmentPct: activeForecastContext.adjustmentPct,
            adjustedForecast: activeForecastContext.adjustedForecast,
          },
        } : {}),
      }),
    });
    const saved = await response.json().catch(() => ({}));
    if (!response.ok || saved.saved !== true) {
      const message = saved.errors ? Object.values(saved.errors).flat()[0] : saved.message;
      throw new Error(message || 'Calculation could not be saved.');
    }
  };

  const handleCompute = async () => {
    const value = (key) => Number(inputs[key]);
    const blank = (key) => String(inputs[key] ?? '').trim() === '';
    const errs = {};
    if (blank('demand') || !(value('demand') > 0)) errs.demand = 'Enter the units sold per year (more than 0).';
    if (blank('orderCost') || !(value('orderCost') > 0)) errs.orderCost = 'Enter the cost of placing one order (more than 0).';
    if (blank('holdingCost') || !(value('holdingCost') > 0)) errs.holdingCost = 'Enter the yearly cost of keeping one unit (more than 0).';
    if (!blank('leadTime') && !(value('leadTime') >= 0)) errs.leadTime = 'Lead time must be 0 or more days.';
    if (!blank('safetyStock') && !(value('safetyStock') >= 0)) errs.safetyStock = 'Safety stock must be 0 or more units.';
    setErrors(errs);
    if (Object.keys(errs).length) return;

    const calculation = calculateOrderQuantity({
      annualDemand: value('demand'),
      orderingCost: value('orderCost'),
      holdingCost: value('holdingCost'),
      leadTimeDays: blank('leadTime') ? 0 : value('leadTime'),
      safetyStock: blank('safetyStock') ? 0 : value('safetyStock'),
    });
    setResult(calculation);
    setResultInputs({ ...inputs });
    setShowResult(true);
    setHistory((prev) => [{
      formulaName: 'Economic Order Quantity',
      product: selectedProduct?.name || 'Manual calculation',
      date: new Date().toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }),
      inputs: {
        'Annual demand': calculation.annualDemand,
        'Ordering cost': calculation.orderingCost,
        'Holding cost': calculation.holdingCost,
        'Lead time (days)': calculation.leadTimeDays,
        'Safety stock': calculation.safetyStock,
      },
      result: calculation.economicOrderQuantity,
      unit: 'units',
    }, ...prev].slice(0, 50));

    setSaving(true);
    setSaveStatus({ type: '', text: '' });
    try {
      await saveCalculation(calculation);
      setSaveStatus({ type: 'ok', text: 'Saved to Reports → Economic Order Quantity Calculator Summary.' });
    } catch (error) {
      setSaveStatus({ type: 'error', text: `The result is shown, but it could not be saved to Reports: ${error.message}` });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setInputs(selectedProduct ? defaultsFor(selectedProduct) : EMPTY_INPUTS);
    setDemandSource(selectedProduct ? 'history' : 'manual');
    setErrors({});
    clearResult();
    setForecastContext(null);
    onClearHandoff?.();
  };

  const applyEstimate = () => {
    const cost = Number(unitCost);
    if (!(cost > 0)) return;
    setInputs((prev) => ({ ...prev, holdingCost: String(Math.round(cost * 0.2 * 100) / 100) }));
    setErrors((prev) => ({ ...prev, holdingCost: '' }));
    setShowEstimator(false);
  };

  const fmt = (v, d = 0) => Number(v).toLocaleString('en-PH', { minimumFractionDigits: d, maximumFractionDigits: d });
  const fmtSmart = (v) => fmt(v, Number.isInteger(Number(v)) ? 0 : 2);

  const demandTag = activeForecastContext
    ? <span className="eq-tag eq-tag-gold">From forecast</span>
    : demandSource === 'history' && selectedProduct
      ? <span className="eq-tag">Last 12 months of sales</span>
      : null;

  const forecastLine = activeForecastContext && (() => {
    const unit = activeForecastContext.periodType;
    const per = Number(activeForecastContext.adjustedForecast);
    const periods = activeForecastContext.annualPeriods || (unit === 'week' ? 52 : unit === 'year' ? 1 : 12);
    const seasonal = activeForecastContext.seasonalEnabled
      ? ` (includes ${activeForecastContext.adjustmentPct >= 0 ? '+' : ''}${activeForecastContext.adjustmentPct}% ${activeForecastContext.seasonalEvent})`
      : '';
    return `${fmtSmart(per)} units/${unit} × ${periods} = ${fmt(activeForecastContext.annualDemand)} units/year${seasonal}`;
  })();

  const stockStatus = result && selectedProduct && currentStock !== null
    ? currentStock <= result.reorderPoint
      ? { tone: 'due', text: `Current stock is ${fmt(currentStock)} unit${currentStock === 1 ? '' : 's'} — at or below the reorder point. Order ${fmt(result.recommendedOrder)} unit${result.recommendedOrder === 1 ? '' : 's'} now.` }
      : { tone: 'ok', text: `Current stock is ${fmt(currentStock)} units — above the reorder point, no order needed yet.` }
    : null;

  /* ===== REPORT EXPORTS ===== */
  const reportRows = (r) => ({
    context: [
      ['Product', selectedProduct?.name || 'Manual calculation'],
      ['Product ID', selectedProduct?.id || '—'],
      ['Demand source', activeForecastContext ? `Forecast — ${forecastLine}` : demandSource === 'history' ? 'Last 12 months of sales' : 'Entered manually'],
      ['Computed by', currentUser || '—'],
      ['Computed at', new Date().toLocaleString('en-PH', { dateStyle: 'long', timeStyle: 'short' })],
    ],
    inputs: [
      ['Annual demand (D)', `${fmtSmart(r.annualDemand)} units/year`],
      ['Ordering cost (S)', `${formatCurrency(r.orderingCost)} per order`],
      ['Holding cost (H)', `${formatCurrency(r.holdingCost)} per unit/year`],
      ['Lead time', `${fmtSmart(r.leadTimeDays)} days`],
      ['Safety stock', `${fmtSmart(r.safetyStock)} units`],
    ],
    results: [
      ['Economic order quantity', `${fmt(r.recommendedOrder)} units per order (exact ${fmt(r.economicOrderQuantity, 2)})`],
      ['Reorder point', `${fmt(r.reorderPoint)} units`],
      ['Orders per year', `${fmt(r.annualOrders, 1)} (about every ${fmt(r.daysBetweenOrders)} days)`],
      ['Annual ordering cost', formatCurrency(r.annualOrdering)],
      ['Annual holding cost', formatCurrency(r.annualHolding)],
      ['Total annual cost', formatCurrency(r.totalCost)],
    ],
  });

  const exportExcel = async () => {
    if (!result) return;
    const rows = reportRows(result);
    try {
      await exportReportWorkbook({
        title: 'Economic Order Quantity Report',
        subtitle: `Order planning for ${selectedProduct?.name || 'manual calculation'}`,
        fileName: `eoq-report-${selectedProduct?.id || 'manual'}`,
        summary: [
          { label: 'Order quantity', value: `${fmt(result.recommendedOrder)} units` },
          { label: 'Reorder point', value: `${fmt(result.reorderPoint)} units` },
          { label: 'Orders per year', value: fmt(result.annualOrders, 1) },
          { label: 'Total annual cost', value: formatCurrency(result.totalCost) },
        ],
        sections: [
          { title: 'Product and demand', headers: ['Item', 'Value'], rows: rows.context },
          { title: 'Inputs', headers: ['Input', 'Value'], rows: rows.inputs },
          { title: 'Results', headers: ['Result', 'Value'], rows: rows.results },
        ],
        scope: `Economic order quantity = ${EOQ_FORMULA}; Reorder point = safety stock + (annual demand ÷ 365 × lead time).`,
        note: 'Planning recommendation only — confirm supplier prices and availability before ordering.',
        columnWidths: [30, 60],
      });
    } catch (error) {
      console.error('Could not export Economic Order Quantity report:', error);
      setSaveStatus({ type: 'error', text: 'The Excel report could not be exported. Please try again.' });
    }
  };

  const exportPdf = () => {
    if (!result) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      setSaveStatus({ type: 'error', text: 'The report could not be opened. Allow pop-ups, then try again.' });
      return;
    }
    const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const rows = reportRows(result);
    const table = (list) => list.map(([label, value]) => `<tr><th>${esc(label)}</th><td>${esc(value)}</td></tr>`).join('');
    printWindow.document.write(`<!doctype html><html lang="en"><head><meta charset="utf-8">
      <title>Economic Order Quantity Report - ${esc(selectedProduct?.name || 'Manual calculation')}</title>
      <style>
        * { box-sizing: border-box; } body { margin: 0; padding: 36px; color: #172033; font: 13px/1.5 Arial, sans-serif; }
        main { max-width: 760px; margin: 0 auto; } header { padding-bottom: 16px; border-bottom: 3px solid #176b57; }
        .brand { color: #176b57; font-size: 12px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
        h1 { margin: 6px 0 2px; font-size: 24px; } .muted { color: #667085; font-size: 12px; }
        .hero { margin: 20px 0; padding: 18px 20px; border-radius: 12px; background: #f0f7f4; }
        .hero b { display: block; color: #176b57; font-size: 34px; } h2 { margin: 18px 0 6px; font-size: 14px; }
        table { width: 100%; border-collapse: collapse; } th, td { padding: 7px 4px; border-bottom: 1px solid #e5e9ed; text-align: left; }
        th { width: 40%; color: #667085; font-weight: 500; } td { font-weight: 600; }
        .formula { margin-top: 16px; padding: 10px 12px; border: 1px solid #e5e9ed; border-radius: 8px; background: #fafbfc; }
        @media print { body { padding: 16mm; } }
      </style></head><body><main>
      <header><div class="brand">GGG Inventory Management System</div><h1>Economic Order Quantity Report</h1>
      <div class="muted">${esc(selectedProduct?.name || 'Manual calculation')}</div></header>
      <div class="hero"><span class="muted">Recommended order quantity</span><b>${esc(fmt(result.recommendedOrder))} units per order</b>
      <span>When stock drops to <strong>${esc(fmt(result.reorderPoint))} units</strong>, reorder ${esc(fmt(result.recommendedOrder))} units.</span></div>
      <h2>Product and demand</h2><table>${table(rows.context)}</table>
      <h2>Inputs</h2><table>${table(rows.inputs)}</table>
      <h2>Results</h2><table>${table(rows.results)}</table>
      <div class="formula">Economic order quantity = ${esc(EOQ_FORMULA)} = √(2 × ${esc(fmtSmart(result.annualDemand))} × ${esc(fmtSmart(result.orderingCost))} ÷ ${esc(fmtSmart(result.holdingCost))}) = ${esc(fmt(result.economicOrderQuantity, 2))}<br>
      Reorder point = ${esc(fmtSmart(result.safetyStock))} + (${esc(fmtSmart(result.annualDemand))} ÷ 365 × ${esc(fmtSmart(result.leadTimeDays))}) = ${esc(fmt(result.reorderPoint))} units</div>
      </main><script>window.addEventListener('load', () => { window.focus(); window.print(); });</script></body></html>`);
    printWindow.document.close();
  };

  useEffect(() => {
    if (!showResult) return undefined;
    const onKey = (event) => { if (event.key === 'Escape') setShowResult(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showResult]);

  const productOptions = useMemo(() => [...products].sort((a, b) => String(a.name).localeCompare(String(b.name))), [products]);

  return (
    <div className="ac-root eq-root">
      {/* ===== HEADER ===== */}
      <div className="eq-header">
        <p className="eq-intro">
          Find <strong>how many units to order each time</strong> at the lowest total ordering + storage cost,
          and <strong>when to reorder</strong>.
        </p>
        <div className="eq-header-actions">
          {canViewHistory && (
          <button className="ac-icon-btn" type="button" onClick={() => setShowHistory(true)}><History size={13} /> History</button>
          )}
          {canOpenForecasting && (
          <button className="ac-icon-btn ac-icon-btn-link" type="button" onClick={() => onNavigate && onNavigate('Forecasting')}>
            <TrendingUp size={13} /> Go to Forecasting
          </button>
          )}
        </div>
      </div>

      {!activeForecastContext && demandSource === 'history' && forecastFallback && (
        <div className="eq-banner" role="status">
          <TrendingUp size={15} />
          <span><strong>No forecast yet — using actual sales.</strong> {forecastFallback} Annual demand below is the last 12 months of recorded sales, not a forecast.</span>
        </div>
      )}

      {activeForecastContext && (
        <div className="eq-banner" role="status">
          <TrendingUp size={15} />
          <span><strong>Annual demand from forecast</strong> ({selectedProduct?.name}, {activeForecastContext.forecastPeriod?.slice(0, 7)}): {forecastLine}</span>
        </div>
      )}

      <div className="eq-grid eq-grid-single">
        {/* ===== INPUTS ===== */}
        <section className="eq-card" aria-labelledby="eq-inputs-title">
          <h2 id="eq-inputs-title">Inputs</h2>

          <div className="eq-form">
            <div className="eq-field eq-span-2">
              <label htmlFor="ac-product-select">Product</label>
              <select id="ac-product-select" className="eq-select" value={selectedProductId} onChange={handleProductSelect} disabled={productsLoading}>
                <option value="">{productsLoading ? 'Loading products…' : '— Select a product (fills in the values below) —'}</option>
                {productOptions.map((product) => (
                  <option key={product.id} value={product.id}>{product.name} ({product.id})</option>
                ))}
              </select>
              {productsError && (
                <span className="eq-error" role="alert">{productsError} <button type="button" className="eq-link" onClick={() => setProductsRetry((r) => r + 1)}>Retry</button></span>
              )}
            </div>

            <Field
              id="eq-demand" name="demand" label="Annual Demand (D)" suffix="units/yr"
              value={inputs.demand} onChange={handleInputChange} error={errors.demand} tag={demandTag}
              hint={activeForecastContext ? 'Forecast for the next 12 months' : 'Units expected to sell per year'}
            />
            <Field
              id="eq-order-cost" name="orderCost" label="Ordering Cost (S)" prefix={currencySymbol} suffix="/order"
              value={inputs.orderCost} onChange={handleInputChange} error={errors.orderCost}
              hint="Delivery + transfer + transport, per order"
            />
            <Field
              id="eq-holding-cost" name="holdingCost" label="Holding Cost (H)" prefix={currencySymbol} suffix="/unit/yr"
              value={inputs.holdingCost} onChange={handleInputChange} error={errors.holdingCost}
              tag={!showEstimator && <button type="button" className="eq-link" onClick={() => setShowEstimator(true)}>Estimate</button>}
              hint="About 20–25% of the unit cost per year"
            >
              {showEstimator && (
                <div className="eq-estimator">
                  <input type="number" min="0" step="any" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} aria-label="Unit cost" placeholder={`Unit cost ${currencySymbol}`} />
                  <button type="button" className="ac-btn-reset" onClick={applyEstimate} disabled={!(Number(unitCost) > 0)}>
                    Use 20%{Number(unitCost) > 0 ? ` = ${currencySymbol}${fmtSmart(Math.round(Number(unitCost) * 0.2 * 100) / 100)}` : ''}
                  </button>
                  <button type="button" className="eq-link" onClick={() => setShowEstimator(false)}>Cancel</button>
                </div>
              )}
            </Field>
            <div className="eq-pair">
              <Field
                id="eq-lead-time" name="leadTime" label="Lead Time" suffix="days"
                value={inputs.leadTime} onChange={handleInputChange} error={errors.leadTime}
                readOnly={leadTimeLocked}
                tag={leadTimeLocked ? lockedTag : null}
                hint={leadTimeLocked
                  ? 'Set by the Super Admin in Settings → Safety Stock Policy'
                  : selectedProduct
                    ? 'No lead time set for this product yet — type one, or set it in Settings'
                    : 'Supplier delivery time'}
              />
              <Field
                id="eq-safety-stock" name="safetyStock" label="Safety Stock" suffix="units"
                value={inputs.safetyStock} onChange={handleInputChange} error={errors.safetyStock}
                readOnly={safetyStockLocked}
                tag={safetyStockLocked ? lockedTag : null}
                hint={safetyStockLocked ? 'Set by the Super Admin in Settings → Safety Stock Policy' : 'Extra buffer units'}
              />
            </div>
            {selectedProduct && allowSaveCosts && (
              <div className="eq-cost-save eq-span-2">
                {savedCosts ? (
                  <span className="eq-cost-save-ok">✓ These are {selectedProduct.name}’s saved costs</span>
                ) : (
                  <button type="button" className="eq-link" onClick={saveCostDefaults} disabled={!canSaveCosts || costSave.state === 'saving'}>
                    {costSave.state === 'saving' ? 'Saving…' : `Save these costs as default for ${selectedProduct.name}`}
                  </button>
                )}
                {costSave.text && costSave.state !== 'saved' && (
                  <span className={costSave.state === 'error' ? 'eq-error' : 'eq-cost-save-ok'} role="status">{costSave.text}</span>
                )}
              </div>
            )}
          </div>

          {currency !== 'PHP' && (
            <p className="eq-note"><Info size={12} /> Amounts are in {currency}. To use pesos, change it in Settings → Currency.</p>
          )}

          <div className="eq-actions">
            <button className="ac-btn-compute" onClick={handleCompute} type="button" disabled={saving}>
              <Calculator size={14} /> {saving ? 'Saving…' : 'Compute Order Quantity'}
            </button>
            <button className="ac-btn-reset" onClick={handleReset} type="button" disabled={saving}>Reset</button>
            {result && (
              <button className="ac-btn-reset eq-last-result" onClick={() => setShowResult(true)} type="button">
                View last result · {fmt(result.recommendedOrder)} unit{result.recommendedOrder === 1 ? '' : 's'}{resultIsStale ? ' (inputs changed)' : ''}
              </button>
            )}
          </div>
          {saveStatus.text && !showResult && (
            <p className={`eq-save is-${saveStatus.type}`} role={saveStatus.type === 'error' ? 'alert' : 'status'}>{saveStatus.text}</p>
          )}
        </section>
      </div>

      {/* ===== RESULT POP-UP ===== */}
      {showResult && result && createPortal(
        <div className="ac-modal-overlay" onClick={() => setShowResult(false)}>
          <section
            className="ac-modal eq-result-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="eq-result-title"
            aria-live="polite"
          >
            <div className="ac-modal-header">
              <div>
                <h3 className="ac-modal-title" id="eq-result-title">Computation Result</h3>
                <p className="eq-result-sub">{selectedProduct?.name || 'Manual calculation'}</p>
              </div>
              <button className="ac-modal-close" type="button" onClick={() => setShowResult(false)} aria-label="Close result"><X size={14} /></button>
            </div>
            <div className="ac-modal-body eq-result-body">
              {resultIsStale && (
                <p className="eq-stale" role="status">Inputs changed — click <strong>Compute Order Quantity</strong> again to update this result.</p>
              )}

              <div className="eq-hero">
                <span>Economic Order Quantity</span>
                <strong>{fmt(result.recommendedOrder)}</strong>
                <em>unit{result.recommendedOrder === 1 ? '' : 's'} per order</em>
                <small>√(2 × {fmtSmart(result.annualDemand)} × {fmtSmart(result.orderingCost)} ÷ {fmtSmart(result.holdingCost)}) = {fmt(result.economicOrderQuantity, 2)}</small>
              </div>

              <div className="eq-stats">
                <div>
                  <span>Reorder Point</span>
                  <strong>{fmt(result.reorderPoint)} <small>units</small></strong>
                  <em>{fmtSmart(result.safetyStock)} + {fmtSmart(result.annualDemand)} ÷ 365 × {fmtSmart(result.leadTimeDays)} days</em>
                </div>
                <div>
                  <span>Safety Stock</span>
                  <strong>{fmtSmart(result.safetyStock)} <small>units</small></strong>
                  <em>buffer for late sales/deliveries</em>
                </div>
                <div>
                  <span>Orders per Year</span>
                  <strong>{fmt(result.annualOrders, 1)}</strong>
                  <em>about every {fmt(result.daysBetweenOrders)} days</em>
                </div>
              </div>

              <p className="eq-sentence">
                When stock drops to <strong>{fmt(result.reorderPoint)} unit{result.reorderPoint === 1 ? '' : 's'}</strong>, the product appears in the Reorder List — order <strong>{fmt(result.recommendedOrder)} unit{result.recommendedOrder === 1 ? '' : 's'}</strong> each time.
              </p>
              {stockStatus && <p className={`eq-status is-${stockStatus.tone}`}>{stockStatus.text}</p>}

              <table className="eq-costs">
                <tbody>
                  <tr><th>Annual ordering cost</th><td>{fmt(result.annualOrders, 1)} orders × {formatCurrency(result.orderingCost)}</td><td>{formatCurrency(result.annualOrdering)}</td></tr>
                  <tr><th>Annual holding cost</th><td>{fmt(result.economicOrderQuantity, 1)} ÷ 2 avg. units × {formatCurrency(result.holdingCost)}</td><td>{formatCurrency(result.annualHolding)}</td></tr>
                  <tr className="eq-total"><th>Total annual cost</th><td /><td>{formatCurrency(result.totalCost)}</td></tr>
                </tbody>
              </table>
              <p className="eq-note"><Info size={12} /> At the economic order quantity the ordering and holding costs are equal — that balance is what makes it the cheapest order size.</p>

              {saveStatus.text && (
                <p className={`eq-save is-${saveStatus.type}`} role={saveStatus.type === 'error' ? 'alert' : 'status'}>{saveStatus.text}</p>
              )}
            </div>
            <div className="ac-modal-footer">
              {canExport && (
                <>
                  <button className="ac-btn-reset" onClick={exportExcel} type="button"><Download size={13} /> Excel</button>
                  <button className="ac-btn-reset" onClick={exportPdf} type="button"><Download size={13} /> PDF</button>
                </>
              )}
              <button className="ac-btn-compute" onClick={() => setShowResult(false)} type="button">Done</button>
            </div>
          </section>
        </div>,
        document.body
      )}

      {showHistory && (
        <HistoryPanel onClose={() => setShowHistory(false)} history={history} onClear={() => setHistory([])} />
      )}
    </div>
  );
}
