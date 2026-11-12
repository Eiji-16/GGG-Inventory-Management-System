import React, { useState, useEffect, useMemo, useRef } from 'react';
import { PageToast } from '../../utils/toast';
import { createPortal } from 'react-dom';
import { X, History, Download, TrendingUp, Calculator, Info, Lock } from 'lucide-react';
import { limitDigits } from '../../utils/numberLimit';
import MarqueeText from '../../utils/marqueeText';
import './autoCal.css';
import apiFetch from '../../apiFetch';
import exportReportWorkbook from '../../utils/exportReportWorkbook';
import { getSystemName } from '../../systemName';
import { useCurrency } from '../../CurrencyContext';
import {
  DEFAULT_SAFETY_STOCK,
  policyFor,
  safetyPointFor,
  statusPointsFor,
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
/* Input limits (2026-11-07). Change these numbers to adjust the rules;
   keep them the same as CalculationController and saveEoqCosts. */
const LIMITS = { demand: 99999, cost: 99999.99, unusualOrderCost: 10000 };
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
  { key: 'Ordering cost', label: 'Ordering cost', money: true },
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
                    <span>{h.unit || 'units'} each time</span>
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
/* ===== NUMBER BOX WITH COMMAS (2026-11-07) =====
   Shows 3321 as "3,321" while typing. The value kept and checked is the
   plain number ("3321"); only what you see has the commas. Up to 5 digits
   before the dot (99,999) and 2 after it, so too-long numbers can't be
   typed at all. The cursor stays where you are typing. */
const toPlain = (text, maxWholeDigits = Infinity, allowDecimals = true) => {
  // Whole numbers only (e.g. a quantity): a typed dot is ignored.
  const cleaned = String(text ?? '').replace(allowDecimals ? /[^\d.]/g : /[^\d]/g, '');
  const [rawWhole, ...rest] = cleaned.split('.');
  // Stop at the allowed number of digits (e.g. 5 → up to 99,999), so a
  // number that is too long simply can't be typed (2026-11-07).
  const whole = rawWhole.replace(/^0+(?=\d)/, '').slice(0, maxWholeDigits);
  return rest.length ? `${whole}.${rest.join('').slice(0, 2)}` : whole;
};
const withCommas = (plain) => {
  const [whole, decimals] = String(plain ?? '').split('.');
  const grouped = whole.replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return decimals !== undefined ? `${grouped}.${decimals}` : grouped;
};

/* Also used by the Restock Report (Reorder List) since 2026-11-08, so the
   same digit limits and commas apply there. allowDecimals={false} for
   whole-number boxes such as Owner's quantity. */
export function CommaNumberInput({ value, onChange, name, maxWholeDigits = 5, allowDecimals = true, ...rest }) {
  const ref = useRef(null);
  const caret = useRef(null);
  const shown = withCommas(value);

  useEffect(() => {
    // Put the cursor back after the same number of digits as before.
    if (caret.current === null || !ref.current || document.activeElement !== ref.current) return;
    let count = caret.current;
    let position = 0;
    while (position < shown.length && count > 0) {
      if (/[\d.]/.test(shown[position])) count -= 1;
      position += 1;
    }
    ref.current.setSelectionRange(position, position);
    caret.current = null;
  }, [shown]);

  const handleChange = (event) => {
    const typed = event.target.value;
    // Already at the digit limit: an extra digit is ignored (nothing moves).
    const wholeDigits = (text) => String(text ?? '').replace(/[^\d.]/g, '').split('.')[0].replace(/^0+(?=\d)/, '').length;
    if (wholeDigits(typed) > maxWholeDigits && wholeDigits(value) >= maxWholeDigits) return;
    const before = typed.slice(0, event.target.selectionStart ?? typed.length);
    caret.current = before.replace(/[^\d.]/g, '').length;
    onChange({ target: { name, value: toPlain(typed, maxWholeDigits, allowDecimals) } });
  };

  return <input ref={ref} type="text" inputMode={allowDecimals ? 'decimal' : 'numeric'} autoComplete="off" name={name} value={shown} onChange={handleChange} {...rest} />;
}

function Field({ id, label, hint, prefix, suffix, error, tag, children, commas = false, ...inputProps }) {
  return (
    <div className="eq-field">
      <div className="eq-label-row">
        <label htmlFor={id}>{label}</label>
        {tag}
      </div>
      <div className={`eq-input-wrap${error ? ' has-error' : ''}`}>
        {prefix && <span className="eq-affix">{prefix}</span>}
        {commas
          ? <CommaNumberInput id={id} {...inputProps} />
          : <input id={id} type="number" min="0" step="any" inputMode="decimal" {...inputProps} />}
        {suffix && <span className="eq-affix eq-suffix">{suffix}</span>}
      </div>
      {/* Field errors show as a bottom-right pop-up; the box stays red. */}
      <PageToast message={error} type="error" />
      {!error && hint && <span className="eq-hint">{hint}</span>}
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
  // Inside Forecasting (2026-11-03): the product comes from Forecasting's
  // own searchable picker, so this calculator hides its product dropdown
  // and its "Go to Forecasting" button and follows `productId`.
  embedded = false,
  productId: controlledProductId = '',
  // Inside Forecasting (2026-11-07): where the intro line and History button
  // go — the Product card at the top of the tab. Without it they stay here.
  headerSlot = null,
}) {
  const { currency, currencySymbol, formatCurrency } = useCurrency();
  const [savedDraft] = useState(() => readCalculatorDraft(currentUserId));
  const [showHistory, setShowHistory] = useState(false);
  // Results open in a pop-up (no empty result panel taking space on the page).
  const [showResult, setShowResult] = useState(false);
  const resultOverlayDown = useRef(false);   // the tap started on the dark area around the result

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
  // Unusual-value check: the inputs already confirmed, and the warning text.
  const [confirmedUnusual, setConfirmedUnusual] = useState('');
  const [unusualNote, setUnusualNote] = useState('');
  const [costSave, setCostSave] = useState({ state: 'idle', text: '' });

  const selectedProduct = products.find((product) => String(product.id) === String(selectedProductId)) || null;
  const activeForecastContext = forecastContext
    && String(forecastContext.productId) === String(selectedProductId)
    && Number(inputs.demand) === Number(forecastContext.annualDemand)
    ? forecastContext
    : null;
  const resultIsStale = Boolean(result && !sameInputs(inputs, resultInputs));
  const currentStock = selectedProduct ? Number(selectedProduct.stock ?? 0) : null;
  /* The level where this product joins the Reorder List (2026-11-08): the
     SAME Low level as the Reorder List and Dashboard — Formula mode: the
     reorder point from the last 12 months of sales; Manual: the Super Admin's
     Low level; no policy: 10. (The calculator's own reorder point uses the
     annual demand typed above, so it can be a different number.) */
  const listPoints = selectedProduct
    ? statusPointsFor({
      productId: selectedProduct.id,
      productName: selectedProduct.name,
      safetyStock: selectedProduct.safetyStock,
      annualDemand: selectedProduct.annualDemand,
      demandFromHistory: selectedProduct.demandFromHistory,
      leadTimeDays: selectedProduct.leadTimeDays,
    }, safetyStock)
    : null;
  const listLevel = listPoints && Number.isFinite(Number(listPoints.low)) ? Number(listPoints.low) : null;

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
      setCostSave({ state: 'saved', text: `Saved for ${selectedProduct.name}. They’ll be filled in for you next time.` });
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
  /* 2026-11-12: a handoff is applied only once. Saving the result reloads the
     product list, which used to apply the forecast handoff again: the inputs
     were filled again and the result window closed by itself. */
  const appliedHandoff = useRef(null);
  useEffect(() => {
    if (!handoff || productsLoading) return;
    if (appliedHandoff.current === handoff) return;
    appliedHandoff.current = handoff;
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

  /* Embedded: follow the product chosen in Forecasting. Skipped while a
     handoff for that same product is being applied (it fills its own values). */
  useEffect(() => {
    if (!embedded || productsLoading) return;
    if (String(controlledProductId || '') === String(selectedProductId || '')) return;
    if (handoff && String(handoff.productId) === String(controlledProductId)) return;
    handleProductSelect({ target: { value: controlledProductId ? String(controlledProductId) : '' } });
  }, [embedded, controlledProductId, productsLoading, products]); // handleProductSelect only reads current state

  const handleInputChange = (e) => {
    const { name } = e.target;
    // Digit limits (2026-11-10): lead time up to 365 (3 digits), safety stock up to 7 digits.
    const value = name === 'leadTime' ? limitDigits(e.target.value, { whole: 3 })
      : name === 'safetyStock' ? limitDigits(e.target.value, { whole: 7 })
        : e.target.value;
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
    // At most 2 numbers after the dot (like money).
    const twoDecimals = (key) => /^\d+(\.\d{1,2})?$/.test(String(inputs[key] ?? '').trim());
    const errs = {};
    /* Limits (2026-11-07): stop typing mistakes such as 2,223,333,333. The
       server checks the same limits (CalculationController). */
    if (blank('demand') || !(value('demand') >= 1) || value('demand') > LIMITS.demand || !twoDecimals('demand')) {
      errs.demand = `Enter the units sold per year: 1 to ${LIMITS.demand.toLocaleString('en-PH')}, up to 2 decimals.`;
    }
    if (blank('orderCost') || !(value('orderCost') >= 0.01) || value('orderCost') > LIMITS.cost || !twoDecimals('orderCost')) {
      errs.orderCost = `Enter the cost of placing one order: ${currencySymbol}0.01 to ${currencySymbol}${LIMITS.cost.toLocaleString('en-PH')}.`;
    }
    if (blank('holdingCost') || !(value('holdingCost') >= 0.01) || value('holdingCost') > LIMITS.cost || !twoDecimals('holdingCost')) {
      errs.holdingCost = `Enter the yearly cost of keeping one unit: ${currencySymbol}0.01 to ${currencySymbol}${LIMITS.cost.toLocaleString('en-PH')}.`;
    }
    if (!blank('leadTime') && !(value('leadTime') >= 0 && value('leadTime') <= 365)) errs.leadTime = 'Lead time must be 0 to 365 days.';
    if (!blank('safetyStock') && !(value('safetyStock') >= 0)) errs.safetyStock = 'Safety stock must be 0 or more units.';
    setErrors(errs);
    if (Object.keys(errs).length) return;

    /* Unusual but allowed: ask once (pop-up), Compute again to go ahead. */
    const unitCostKnown = Number(selectedProduct?.unitCost) > 0 ? Number(selectedProduct.unitCost) : null;
    const unusual = [];
    if (unitCostKnown !== null && value('holdingCost') > unitCostKnown) {
      unusual.push(`the holding cost (${formatCurrency(value('holdingCost'))}) is higher than the unit cost (${formatCurrency(unitCostKnown)})`);
    }
    if (value('orderCost') > LIMITS.unusualOrderCost) {
      unusual.push(`the ordering cost (${formatCurrency(value('orderCost'))}) is very high`);
    }
    const unusualKey = `${inputs.demand}|${inputs.orderCost}|${inputs.holdingCost}`;
    if (unusual.length && confirmedUnusual !== unusualKey) {
      setConfirmedUnusual(unusualKey);
      setUnusualNote(`Please check: ${unusual.join(' and ')}. If it's correct, click Compute again.`);
      return;
    }
    setUnusualNote('');

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

  // Uses the Reorder List's Low level, so this matches the Reorder List.
  const stockStatus = result && selectedProduct && currentStock !== null && listLevel !== null
    ? currentStock <= listLevel
      ? { tone: 'due', text: `Current stock is ${fmt(currentStock)} unit${currentStock === 1 ? '' : 's'} — at or below its Low level (${fmt(listLevel)}). Restock ${fmt(result.recommendedOrder)} unit${result.recommendedOrder === 1 ? '' : 's'} now.` }
      : { tone: 'ok', text: `Current stock is ${fmt(currentStock)} units — above its Low level (${fmt(listLevel)}), no restock needed yet.` }
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
        subtitle: `Restock planning for ${selectedProduct?.name || 'manual calculation'}`,
        fileName: `eoq-report-${selectedProduct?.id || 'manual'}`,
        summary: [
          { label: 'Economic Order Quantity', value: `${fmt(result.recommendedOrder)} units` },
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
        note: 'Planning recommendation only — confirm supplier prices and availability before buying.',
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
      <header><div class="brand">${esc(getSystemName())}</div><h1>Economic Order Quantity Report</h1>
      <div class="muted">${esc(selectedProduct?.name || 'Manual calculation')}</div></header>
      <div class="hero"><span class="muted">Economic Order Quantity</span><b>${esc(fmt(result.recommendedOrder))} units each time</b>
      <span>When stock drops to <strong>${esc(fmt(listLevel ?? result.reorderPoint))} units</strong>, restock ${esc(fmt(result.recommendedOrder))} units.</span></div>
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
      {/* ===== HEADER =====
          The intro line stays here. Inside Forecasting, only the History
          button moves into the Product card (2026-11-07). */}
      {(() => {
        const actions = (
        <div className={`eq-header-actions${headerSlot ? ' eq-header-actions-in-toolbar' : ''}`}>
          {canViewHistory && (
          <button className="ac-icon-btn" type="button" onClick={() => setShowHistory(true)}><History size={13} /> History</button>
          )}
          {canOpenForecasting && !embedded && (
          <button className="ac-icon-btn ac-icon-btn-link" type="button" onClick={() => onNavigate && onNavigate('Forecasting')}>
            <TrendingUp size={13} /> Go to Forecasting
          </button>
          )}
        </div>
        );
        return (
      <>
      <div className="eq-header">
        <p className="eq-intro hint-text">
          Find <strong>how many units to buy each time</strong> at the lowest total ordering + storage cost,
          and <strong>when to restock</strong>.
        </p>
        {!headerSlot && actions}
      </div>
      {headerSlot && createPortal(actions, headerSlot)}
      </>
        );
      })()}

      {/* Forecast notes show as a bottom-right pop-up (2026-11-06). They show
          again when another product is chosen (the text changes). */}
      <PageToast type="warning" title="Unusual value" message={unusualNote} onShown={() => setUnusualNote('')} />
      <PageToast
        type="warning"
        title="No forecast yet — using actual sales."
        message={!activeForecastContext && demandSource === 'history' && forecastFallback
          ? `${forecastFallback} Annual demand below is the last 12 months of recorded sales, not a forecast.`
          : ''}
      />
      <PageToast
        type="info"
        title="Annual demand from forecast"
        message={activeForecastContext
          ? `${selectedProduct?.name || 'This product'}, ${activeForecastContext.forecastPeriod?.slice(0, 7) || ''}: ${forecastLine}`
          : ''}
      />

      <div className="eq-grid eq-grid-single">
        {/* ===== INPUTS ===== */}
        <section className="eq-card" aria-labelledby="eq-inputs-title">
          <h2 id="eq-inputs-title">Inputs</h2>

          <div className="eq-form">
            {!embedded && (
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
            )}

            <Field
              id="eq-demand" name="demand" label="Annual Demand (D)" suffix="units/yr" commas
              value={inputs.demand} onChange={handleInputChange} error={errors.demand} tag={demandTag}
              hint={activeForecastContext ? 'Forecast for the next 12 months' : 'Units expected to sell per year'}
            />
            <Field
              id="eq-order-cost" name="orderCost" label="Ordering Cost (S)" prefix={currencySymbol} suffix="/order" commas
              value={inputs.orderCost} onChange={handleInputChange} error={errors.orderCost}
              hint="Delivery + transfer + transport, per order"
            />
            <Field
              id="eq-holding-cost" name="holdingCost" label="Holding Cost (H)" prefix={currencySymbol} suffix="/unit/yr" commas
              value={inputs.holdingCost} onChange={handleInputChange} error={errors.holdingCost}
              tag={(
                /* The same link opens and closes the helper, so the label row
                   never changes height (2026-11-07). */
                <button type="button" className="eq-link" aria-expanded={showEstimator} onClick={() => setShowEstimator((open) => !open)}>
                  {showEstimator ? 'Close' : 'Estimate'}
                </button>
              )}
              hint="About 20–25% of the unit cost per year"
            />
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
            {/* Holding cost helper (2026-11-07): its own box in the empty space
                beside Safety Stock, so the other boxes never move. */}
            {showEstimator && (
              <div className="eq-field eq-estimator-cell">
                <div className="eq-label-row"><label htmlFor="eq-unit-cost">Unit cost</label></div>
                <div className="eq-estimator">
                  <div className="eq-input-wrap">
                    <span className="eq-affix">{currencySymbol}</span>
                    <CommaNumberInput id="eq-unit-cost" name="unitCost" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} placeholder="Unit cost" autoFocus />
                  </div>
                  <button type="button" className="ac-btn-reset" onClick={applyEstimate} disabled={!(Number(unitCost) > 0)} title={Number(unitCost) > 0 ? 'Use 20% of the unit cost as the holding cost' : 'Type the unit cost first'}>
                    Use 20%{Number(unitCost) > 0 ? ` = ${currencySymbol}${fmtSmart(Math.round(Number(unitCost) * 0.2 * 100) / 100)}` : ''}
                  </button>
                </div>
              </div>
            )}
            {selectedProduct && allowSaveCosts && (
              <div className="eq-cost-save eq-span-2">
                <PageToast message={costSave.state === 'error' ? costSave.text : ''} type="error" />
                {savedCosts ? (
                  <span className="eq-cost-save-ok">✓ These are {selectedProduct.name}’s saved costs</span>
                ) : (
                  <button type="button" className="eq-link" onClick={saveCostDefaults} disabled={!canSaveCosts || costSave.state === 'saving'}>
                    {costSave.state === 'saving' ? 'Saving…' : `Save these costs as default for ${selectedProduct.name}`}
                  </button>
                )}
                {costSave.text && costSave.state !== 'saved' && costSave.state !== 'error' && (
                  <span className="eq-cost-save-ok" role="status">{costSave.text}</span>
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
        /* 2026-11-12: closes only when a tap both starts and ends on the dark
           area. On phones a scroll that ended outside the window used to
           count as a tap there and closed the result. */
        <div
          className="ac-modal-overlay"
          onPointerDown={(e) => { resultOverlayDown.current = e.target === e.currentTarget; }}
          onClick={(e) => { if (resultOverlayDown.current && e.target === e.currentTarget) setShowResult(false); resultOverlayDown.current = false; }}
        >
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
                <strong><MarqueeText>{fmt(result.recommendedOrder)}</MarqueeText></strong>
                <em>unit{result.recommendedOrder === 1 ? '' : 's'} per order</em>
                <small>√(2 × {fmtSmart(result.annualDemand)} × {fmtSmart(result.orderingCost)} ÷ {fmtSmart(result.holdingCost)}) = {fmt(result.economicOrderQuantity, 2)}</small>
              </div>

              <div className="eq-stats">
                <div>
                  <span>Reorder Point</span>
                  <strong><MarqueeText>{fmt(result.reorderPoint)} <small>units</small></MarqueeText></strong>
                  <em>{fmtSmart(result.safetyStock)} + {fmtSmart(result.annualDemand)} ÷ 365 × {fmtSmart(result.leadTimeDays)} days</em>
                </div>
                <div>
                  <span>Safety Stock</span>
                  <strong><MarqueeText>{fmtSmart(result.safetyStock)} <small>units</small></MarqueeText></strong>
                  <em>buffer for late sales/deliveries</em>
                </div>
                <div>
                  <span>Orders per Year</span>
                  <strong><MarqueeText>{fmt(result.annualOrders, 1)}</MarqueeText></strong>
                  <em>about every {fmt(result.daysBetweenOrders)} days</em>
                </div>
              </div>

              <p className="eq-sentence">
                {listLevel !== null ? (
                  <>
                    This product appears in the Reorder List when stock is at or below its Low level of <strong>{fmt(listLevel)} unit{listLevel === 1 ? '' : 's'}</strong>{listPoints?.mode === 'manual' ? ' (set in the Safety Stock Policy)' : ''} — restock <strong>{fmt(result.recommendedOrder)} unit{result.recommendedOrder === 1 ? '' : 's'}</strong> each time.
                    {listLevel !== result.reorderPoint && (
                      <span className="hint-text"> The reorder point above uses the annual demand in this calculation, so it can differ.</span>
                    )}
                  </>
                ) : (
                  <>
                    When stock drops to <strong>{fmt(result.reorderPoint)} unit{result.reorderPoint === 1 ? '' : 's'}</strong>, restock <strong>{fmt(result.recommendedOrder)} unit{result.recommendedOrder === 1 ? '' : 's'}</strong> each time.
                  </>
                )}
              </p>
              {stockStatus && <p className={`eq-status is-${stockStatus.tone}`}>{stockStatus.text}</p>}

              <table className="eq-costs">
                <tbody>
                  <tr><th>Annual ordering cost</th><td>{fmt(result.annualOrders, 1)} orders × {formatCurrency(result.orderingCost)}</td><td>{formatCurrency(result.annualOrdering)}</td></tr>
                  <tr><th>Annual holding cost</th><td>{fmt(result.economicOrderQuantity, 1)} ÷ 2 avg. units × {formatCurrency(result.holdingCost)}</td><td>{formatCurrency(result.annualHolding)}</td></tr>
                  <tr className="eq-total"><th>Total annual cost</th><td /><td>{formatCurrency(result.totalCost)}</td></tr>
                </tbody>
              </table>
              <p className="eq-note"><Info size={12} /> At the economic order quantity the ordering and holding costs are equal — that balance is what makes it the cheapest amount to buy each time.</p>

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
