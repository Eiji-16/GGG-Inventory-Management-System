import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Save, X } from 'lucide-react';
import apiFetch from '../../apiFetch';
import { buildTablePdf, downloadBlob } from '../../utils/simplePdf';
import { buildForecastHandoff } from '../../utils/forecastHandoff';
import { useCurrency } from '../../CurrencyContext';
import { orderPresets, PRESET_LABELS } from '../../utils/orderPresets';

/* ===== RESTOCK REPORT (Reorder List; was "Bulk order") =====
   The system does not buy anything. This window works out how many units to
   restock for the ticked products and produces a report (PDF) to give
   to the person who does the buying outside the system.

   Each product shows two numbers:
     System suggested = Economic Order Quantity (below); when the costs are
                        missing, "Back above reorder point" instead.
     Owner's quantity = starts at the suggestion; the owner can type more or
                        fewer (e.g. suggested 3, owner wants 5).
   A product can be taken off the report with ×.

   The suggestion uses the SAME method as "Order Now" + the calculator, one
   product at a time:

     order quantity = √(2 × annual demand × ordering cost ÷ holding cost)

   Annual demand  = next month's forecast × 12 (weighted moving average with
                    seasonal events), or the last 12 months of sales when there
                    isn't enough history to forecast.
   Ordering cost  = cost of placing one order       } from the product's saved
   Holding cost   = cost of keeping 1 unit for 1 yr } costs, or typed here.

   "Save Report" (one button) keeps each product's final quantity for the
   Received window, stores each row as a normal calculation (so it appears
   in Reports → Economic Order Quantity Calculator Summary) and downloads
   the report as a PDF. Nothing here changes
   stock or marks anything as ordered: stock changes only when the delivery
   arrives and a Stock In is recorded. */

const toNumber = (value) => (String(value ?? '').trim() === '' ? NaN : Number(value));
const positive = (value) => Number.isFinite(toNumber(value)) && toNumber(value) > 0;
export const orderQuantityFor = (row) => (
  positive(row.annualDemand) && positive(row.orderingCost) && positive(row.holdingCost)
    ? Math.sqrt((2 * toNumber(row.annualDemand) * toNumber(row.orderingCost)) / toNumber(row.holdingCost))
    : null
);

export default function BulkOrder({ items, onClose, onSaved }) {
  const { formatCurrency, currencySymbol } = useCurrency();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sameCosts, setSameCosts] = useState({ orderingCost: '', holdingCost: '' });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [savedIds, setSavedIds] = useState(new Set());

  /* Load each product's demand (same as Order Now) and its last Stock In
     price (for the estimated cost) once, when the window opens. */
  useEffect(() => {
    let active = true;
    (async () => {
      const lastInPrice = new Map();
      try {
        const response = await fetch('/api/stock-movements', { headers: { Accept: 'application/json' }, cache: 'no-store' });
        const movements = response.ok ? await response.json() : [];
        // The list is newest first, so the first Stock In seen is the latest.
        (Array.isArray(movements) ? movements : []).forEach((movement) => {
          if (movement.type === 'Stock In' && movement.unitPrice != null && !lastInPrice.has(movement.productId)) {
            lastInPrice.set(movement.productId, Number(movement.unitPrice));
          }
        });
      } catch {
        /* the estimate is optional */
      }

      const loaded = await Promise.all(items.map(async (item) => {
        const { handoff } = await buildForecastHandoff(item.id, item.name);
        const history = Number(item.annualDemand || item.demandFromHistory) || 0;
        return {
          id: item.id,
          name: item.name,
          ownerQty: '',            // '' = same as the system suggestion
          supplierName: item.supplierName,
          stock: item.stock,
          reorderPoint: item.reorderPoint,
          forecast: handoff,                     // null = no forecast yet
          demandSource: handoff ? 'forecast' : (history > 0 ? 'history' : 'none'),
          annualDemand: handoff ? String(handoff.annualDemand) : (history > 0 ? String(history) : ''),
          orderingCost: item.orderingCost != null ? String(item.orderingCost) : '',
          holdingCost: item.holdingCost != null ? String(item.holdingCost) : '',
          unitPrice: lastInPrice.get(item.id) ?? null,
        };
      }));
      if (active) {
        setRows(loaded);
        setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [items]);

  const updateRow = (id, field, value) => {
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, [field]: value } : row)));
    // The owner's quantity is not part of the saved calculation.
    if (field !== 'ownerQty') setSavedIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
  };

  /* Take a product off this report (the Reorder List itself is not changed). */
  const removeRow = (id) => setRows((prev) => prev.filter((row) => row.id !== id));

  const applySameCosts = () => {
    setRows((prev) => prev.map((row) => ({
      ...row,
      orderingCost: positive(sameCosts.orderingCost) ? sameCosts.orderingCost : row.orderingCost,
      holdingCost: positive(sameCosts.holdingCost) ? sameCosts.holdingCost : row.holdingCost,
    })));
    setSavedIds(new Set());
  };

  const computed = useMemo(() => rows.map((row) => {
    const exact = orderQuantityFor(row);
    const quantity = exact === null ? null : Math.round(exact);
    const monthly = row.forecast
      ? Number(row.forecast.adjustedForecast)
      : (positive(row.annualDemand) ? Number(row.annualDemand) / 12 : null);
    const presets = orderPresets({ eoq: quantity, stock: row.stock, reorderPoint: row.reorderPoint, monthlyDemand: monthly });
    // System suggested: Economic Order Quantity, else back above the reorder point.
    const suggestion = presets.find((option) => option.key === 'eoq') || presets.find((option) => option.key === 'reorder') || null;
    const suggestedQty = suggestion ? suggestion.qty : null;
    // Owner's quantity: typed, else the suggestion.
    const typed = String(row.ownerQty ?? '').trim();
    const ownerValid = typed === '' || (/^\d+$/.test(typed) && Number(typed) >= 1 && Number(typed) <= 9999);
    const listQty = typed === '' ? suggestedQty : (ownerValid ? Number(typed) : null);
    return {
      ...row,
      exact,
      quantity,
      presets,
      suggestion,
      suggestedQty,
      ownerValid,
      custom: typed !== '' && listQty !== suggestedQty,
      listQty,
      estimatedCost: listQty !== null && row.unitPrice != null ? listQty * row.unitPrice : null,
    };
  }), [rows]);

  // "ready" = has an Economic Order Quantity (these can be saved to Reports);
  // "listed" = has an owner's quantity (report and totals).
  const ready = computed.filter((row) => row.quantity !== null);
  const listed = computed.filter((row) => row.listQty !== null);
  const missing = computed.length - listed.length;
  const totalUnits = listed.reduce((sum, row) => sum + row.listQty, 0);
  const totalSuggested = listed.reduce((sum, row) => sum + (row.suggestedQty || 0), 0);
  const totalCost = listed.reduce((sum, row) => sum + (row.estimatedCost || 0), 0);
  const anyWithoutPrice = listed.some((row) => row.estimatedCost === null);

  /* Save each ready row exactly like the calculator does (POST /calculations),
     so it shows in Reports → Economic Order Quantity Calculator Summary.
     Returns the list of problems (empty = all saved). */
  const saveCalculations = async () => {
    const failed = [];
    const saved = new Set(savedIds);
    for (const row of ready) {
      if (saved.has(row.id)) continue;
      const useForecast = row.demandSource === 'forecast' && row.forecast
        && Number(row.annualDemand) === Number(row.forecast.annualDemand);
      try {
        const response = await apiFetch('/calculations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            formula: 'EOQ',
            unit: 'units',
            productId: row.id,
            demandSource: useForecast ? 'forecast' : 'historical',
            inputs: {
              annualDemand: Number(row.annualDemand),
              orderingCost: Number(row.orderingCost),
              holdingCost: Number(row.holdingCost),
            },
            ...(useForecast ? {
              forecast: {
                productId: row.forecast.productId,
                periodType: row.forecast.periodType,
                forecastPeriod: row.forecast.forecastPeriod,
                baseForecast: row.forecast.baseForecast,
                seasonalEnabled: row.forecast.seasonalEnabled,
                seasonalEvent: row.forecast.seasonalEvent,
                adjustmentPct: row.forecast.adjustmentPct,
                adjustedForecast: row.forecast.adjustedForecast,
              },
            } : {}),
          }),
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok || body.saved !== true) {
          throw new Error((body.errors ? Object.values(body.errors).flat()[0] : body.message) || `Error ${response.status}`);
        }
        saved.add(row.id);
      } catch (error) {
        failed.push(`${row.name}: ${error.message}`);
      }
    }
    setSavedIds(saved);
    return failed;
  };

  /* ===== SAVE REPORT (one button, 2026-11-03) =====
     1. keeps each product's final quantity (owner's number) so the
        "Received" window can offer it later,
     2. saves the Economic Order Quantity results to Reports,
     3. downloads the Restock Report as a PDF file. */
  const saveReport = async () => {
    if (!listed.length || saving) return;
    setSaving(true);
    setMessage({ type: '', text: '' });
    const problems = [];
    try {
      const response = await apiFetch('/api/restock-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: listed.map((row) => ({ productId: row.id, qty: row.listQty, suggested: row.suggestedQty })),
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error((body.errors ? Object.values(body.errors).flat()[0] : body.message) || `Error ${response.status}`);
      }
    } catch (error) {
      problems.push(`Quantities not kept for Received: ${error.message}`);
    }
    problems.push(...await saveCalculations());

    let downloaded = false;
    try {
      downloadBlob(buildReportPdf(), `restock-report-${new Date().toISOString().slice(0, 10)}.pdf`);
      downloaded = true;
    } catch (error) {
      console.error('Could not build the Restock Report PDF:', error);
      problems.push('The PDF could not be created.');
    }
    setSaving(false);
    setMessage(problems.length
      ? { type: 'error', text: `${downloaded ? 'The PDF was downloaded, but ' : ''}some parts were not saved — ${problems.join(' · ')}` }
      : { type: 'ok', text: `Report saved and downloaded. The quantities are ready in “Received”, and ${ready.length} Economic Order Quantity result${ready.length === 1 ? ' is' : 's are'} in Reports.` });
    onSaved?.();
  };

  const sourceLabel = (row) => ({
    forecast: 'Forecast × 12',
    history: 'Last 12 months',
    none: 'No sales — type it',
  }[row.demandSource]);

  const preparedOn = () => new Date().toLocaleString('en-PH', { dateStyle: 'long', timeStyle: 'short' });

  /* The Restock Report as a PDF file (src/utils/simplePdf.js). */
  const buildReportPdf = () => buildTablePdf({
    title: 'Restock Report',
    subtitle: `Restock quantities for ${listed.length} product${listed.length === 1 ? '' : 's'} · prepared ${preparedOn()}`,
    summary: [
      { label: 'Date prepared', value: new Date().toLocaleDateString('en-PH', { dateStyle: 'long' }) },
      { label: 'Products', value: String(listed.length) },
      { label: 'System suggested (units)', value: totalSuggested.toLocaleString('en-PH') },
      { label: 'Owner\u2019s total (units)', value: totalUnits.toLocaleString('en-PH') },
      { label: 'Estimated total cost', value: formatCurrency(totalCost) },
    ],
    headers: ['Product', 'Supplier', 'Stock', 'Annual demand', 'Demand from', `Ordering cost (${currencySymbol})`, `Holding cost (${currencySymbol})`, 'System suggested', 'Owner\u2019s quantity', 'Estimated cost'],
    widths: [2.8, 1.8, 0.8, 1.1, 2, 1.3, 1.3, 1.2, 1.2, 1.4],
    align: ['left', 'left', 'right', 'right', 'left', 'right', 'right', 'right', 'right', 'right'],
    rows: listed.map((row) => [
      row.name,
      row.supplierName || '\u2014',
      String(row.stock),
      Number(row.annualDemand || 0).toLocaleString('en-PH'),
      sourceLabel(row),
      positive(row.orderingCost) ? formatCurrency(Number(row.orderingCost)) : '\u2014',
      positive(row.holdingCost) ? formatCurrency(Number(row.holdingCost)) : '\u2014',
      row.suggestedQty !== null ? row.suggestedQty.toLocaleString('en-PH') : '\u2014',
      row.listQty.toLocaleString('en-PH'),
      row.estimatedCost !== null ? formatCurrency(row.estimatedCost) : '\u2014',
    ]),
    totals: ['Total', '', '', '', '', '', '', totalSuggested.toLocaleString('en-PH'), totalUnits.toLocaleString('en-PH'), formatCurrency(totalCost)],
    notes: [
      `System suggested = ${PRESET_LABELS.eoq}, \u221a(2 \u00d7 annual demand \u00d7 ordering cost \u00f7 holding cost); without costs it is ${PRESET_LABELS.reorder.toLowerCase()} (reorder point + 1 \u2212 stock). Owner\u2019s quantity = the amount the owner decided.`,
      'Estimated cost uses each product\u2019s last Stock In price. The system does not place orders: give this report to the person responsible for buying. Stock only changes when the delivery is marked as Received.',
    ],
  });

  return createPortal(
    <div className="ra-modal-overlay" onClick={() => !saving && onClose()}>
      <div className="ra-modal ra-bulk-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="ra-bulk-title">
        <div className="ra-bulk-head">
          <div>
            <h3 id="ra-bulk-title">Restock Report — {computed.length} product{computed.length === 1 ? '' : 's'}</h3>
            <p className="ra-modal-sub hint-text">
              System suggested = √(2 × annual demand × ordering cost ÷ holding cost), the same as “Order Now”. Type your own amount in Owner’s quantity if you want more or fewer. “Save Report” keeps the result for “Received” and downloads the PDF to give to the person who buys.
            </p>
          </div>
          <button type="button" className="ra-bulk-close" onClick={onClose} disabled={saving} aria-label="Close"><X size={16} /></button>
        </div>

        <div className="ra-bulk-same">
          <span>Use the same costs for all:</span>
          <label>
            Ordering cost ({currencySymbol})
            <input type="number" min="0" step="0.01" value={sameCosts.orderingCost}
              onChange={(e) => setSameCosts((prev) => ({ ...prev, orderingCost: e.target.value }))} placeholder="per order" />
          </label>
          <label>
            Holding cost ({currencySymbol})
            <input type="number" min="0" step="0.01" value={sameCosts.holdingCost}
              onChange={(e) => setSameCosts((prev) => ({ ...prev, holdingCost: e.target.value }))} placeholder="per unit / year" />
          </label>
          <button type="button" className="ra-order-btn" onClick={applySameCosts}
            disabled={!positive(sameCosts.orderingCost) && !positive(sameCosts.holdingCost)}>Apply to all</button>
        </div>

        <div className="ra-table-scroll ra-bulk-scroll">
          <table className="ra-table ra-bulk-table">
            <thead>
              <tr>
                <th className="ra-left">Product</th>
                <th>Stock</th>
                <th>Annual demand</th>
                <th>Ordering cost</th>
                <th>Holding cost</th>
                <th>System suggested</th>
                <th>Owner’s quantity</th>
                <th>Estimated cost</th>
                <th><span className="ra-sr-only">Remove</span></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="ra-empty">Getting each product’s forecast…</td></tr>
              ) : computed.length === 0 ? (
                <tr><td colSpan={9} className="ra-empty">Every product was removed. Close this window and tick products again.</td></tr>
              ) : computed.map((row) => (
                <tr key={row.id} className={row.listQty === null ? 'is-incomplete' : ''}>
                  <td data-label="Product">
                    <span className="ra-product">
                      <strong>{row.name}</strong>
                      <small>{row.supplierName || 'No supplier'} · reorder point {row.reorderPoint}</small>
                    </span>
                  </td>
                  <td data-label="Stock" className="ra-num">{row.stock}</td>
                  <td data-label="Annual demand">
                    {row.demandSource === 'forecast' ? (
                      <span className="ra-product"><strong>{Number(row.annualDemand).toLocaleString('en-PH')}</strong><small>{sourceLabel(row)}</small></span>
                    ) : (
                      <span className="ra-product">
                        <input className="ra-bulk-input" type="number" min="0" step="1" value={row.annualDemand}
                          onChange={(e) => updateRow(row.id, 'annualDemand', e.target.value)} aria-label={`Annual demand for ${row.name}`} />
                        <small>{sourceLabel(row)}</small>
                      </span>
                    )}
                  </td>
                  <td data-label="Ordering cost">
                    <input className="ra-bulk-input" type="number" min="0" step="0.01" value={row.orderingCost} placeholder="Required"
                      onChange={(e) => updateRow(row.id, 'orderingCost', e.target.value)} aria-label={`Ordering cost for ${row.name}`} />
                  </td>
                  <td data-label="Holding cost">
                    <input className="ra-bulk-input" type="number" min="0" step="0.01" value={row.holdingCost} placeholder="Required"
                      onChange={(e) => updateRow(row.id, 'holdingCost', e.target.value)} aria-label={`Holding cost for ${row.name}`} />
                  </td>
                  <td data-label="System suggested" className="ra-num">
                    {row.suggestedQty !== null ? (
                      <span
                        className="ra-product"
                        title={row.quantity !== null
                          ? `√(2 × ${row.annualDemand} × ${row.orderingCost} ÷ ${row.holdingCost}) = ${row.exact.toFixed(2)}`
                          : row.suggestion.hint}
                      >
                        <strong className="ra-bulk-qty">{row.suggestedQty.toLocaleString('en-PH')}</strong>
                        <small>{row.quantity !== null ? 'Economic Order Quantity' : 'No costs yet'}</small>
                        {savedIds.has(row.id) && <small>Saved to Reports</small>}
                      </span>
                    ) : <span className="ra-muted">Fill in all 3</span>}
                  </td>
                  <td data-label="Owner’s quantity" className="ra-num">
                    <span className="ra-product">
                      <input
                        className={`ra-bulk-input ra-bulk-owner${row.ownerValid ? '' : ' is-invalid'}`}
                        type="number"
                        min="1"
                        max="9999"
                        step="1"
                        inputMode="numeric"
                        value={row.ownerQty}
                        placeholder={row.suggestedQty !== null ? String(row.suggestedQty) : 'Type it'}
                        onChange={(e) => updateRow(row.id, 'ownerQty', e.target.value)}
                        aria-label={`Owner's quantity for ${row.name}`}
                      />
                      <small>{!row.ownerValid ? '1 to 9,999' : row.custom ? 'Your own' : 'Same'}</small>
                    </span>
                  </td>
                  <td data-label="Estimated cost" className="ra-num">
                    {row.estimatedCost !== null ? formatCurrency(row.estimatedCost) : <span className="ra-muted">—</span>}
                  </td>
                  <td data-label="Remove">
                    <button type="button" className="ra-bulk-remove" onClick={() => removeRow(row.id)} disabled={saving} title="Take this product off the report" aria-label={`Remove ${row.name} from the report`}>
                      <X size={14} aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!loading && (
          <div className="ra-bulk-totals">
            <span><b>{listed.length}</b> of {computed.length} on the report</span>
            <span>System suggested: <b>{totalSuggested.toLocaleString('en-PH')}</b> units</span>
            <span>Owner’s total: <b>{totalUnits.toLocaleString('en-PH')}</b> units</span>
            <span>Estimated cost: <b>{formatCurrency(totalCost)}</b>{anyWithoutPrice ? ' (some items have no Stock In price yet)' : ''}</span>
            {missing > 0 && <span className="ra-muted">{missing} still need a quantity</span>}
          </div>
        )}

        {message.text && <p className={message.type === 'error' ? 'ra-error' : 'ra-notice'} role="status">{message.text}</p>}

        <div className="ra-modal-actions ra-save-report">
          <button type="button" className="ra-order-btn" onClick={onClose} disabled={saving}>Close</button>
          <button
            type="button"
            className="ra-order-btn is-urgent ra-save-report-btn"
            onClick={saveReport}
            disabled={!listed.length || loading || saving}
            title="Save Report: saves the result (quantities for Received + Economic Order Quantity results in Reports) and downloads the PDF"
            aria-label="Save Report: saves the result and downloads the PDF"
          >
            <Save size={14} aria-hidden="true" />
            <span className="ra-save-report-text">{saving ? 'Saving…' : 'Save Report'}</span>
          </button>
        </div>
        <p className="ra-help">“Save Report” saves the result and downloads the PDF. Report only: this does not change stock or place any order. Buying happens outside the system; when the delivery arrives, press “Received” on the product and enter what actually arrived.</p>
      </div>
    </div>,
    document.body,
  );
}
