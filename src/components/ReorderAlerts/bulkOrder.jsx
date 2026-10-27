import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Calculator, Download, FileText, X } from 'lucide-react';
import apiFetch from '../../apiFetch';
import exportReportWorkbook from '../../utils/exportReportWorkbook';
import { buildForecastHandoff } from '../../utils/forecastHandoff';
import { useCurrency } from '../../CurrencyContext';

/* ===== BULK ORDER (Reorder List) =====
   Works out the order quantity for several products at once, using the SAME
   method as "Order Now" + the calculator, one product at a time:

     order quantity = √(2 × annual demand × ordering cost ÷ holding cost)

   Annual demand  = next month's forecast × 12 (weighted moving average with
                    seasonal events), or the last 12 months of sales when there
                    isn't enough history to forecast.
   Ordering cost  = cost of placing one order       } from the product's saved
   Holding cost   = cost of keeping 1 unit for 1 yr } costs, or typed here.

   Saving stores each row as a normal calculation, so it appears in
   Reports → Economic Order Quantity Calculator Summary. Nothing here changes
   stock or marks anything as ordered: stock changes only when the delivery
   arrives and a Stock In is recorded. */

const toNumber = (value) => (String(value ?? '').trim() === '' ? NaN : Number(value));
const positive = (value) => Number.isFinite(toNumber(value)) && toNumber(value) > 0;
const orderQuantityFor = (row) => (
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
    setSavedIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
  };

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
    return {
      ...row,
      exact,
      quantity,
      estimatedCost: quantity !== null && row.unitPrice != null ? quantity * row.unitPrice : null,
    };
  }), [rows]);

  const ready = computed.filter((row) => row.quantity !== null);
  const missing = computed.length - ready.length;
  const totalUnits = ready.reduce((sum, row) => sum + row.quantity, 0);
  const totalCost = ready.reduce((sum, row) => sum + (row.estimatedCost || 0), 0);
  const anyWithoutPrice = ready.some((row) => row.estimatedCost === null);

  /* Save each ready row exactly like the calculator does (POST /calculations). */
  const saveAll = async () => {
    if (!ready.length || saving) return;
    setSaving(true);
    setMessage({ type: '', text: '' });
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
    setSaving(false);
    const savedCount = ready.filter((row) => saved.has(row.id)).length;
    setMessage(failed.length
      ? { type: 'error', text: `Saved ${savedCount} of ${ready.length}. Not saved — ${failed.join(' · ')}` }
      : { type: 'ok', text: `Saved ${savedCount} calculation${savedCount === 1 ? '' : 's'} to Reports → Economic Order Quantity Calculator Summary.` });
    if (savedCount) onSaved?.();
  };

  const sourceLabel = (row) => ({
    forecast: 'Forecast × 12',
    history: 'Last 12 months of sales',
    none: 'No sales yet — type it in',
  }[row.demandSource]);

  const exportRows = () => ready.map((row) => [
    row.name,
    row.supplierName || '—',
    row.stock,
    row.reorderPoint,
    Number(row.annualDemand),
    sourceLabel(row),
    Number(row.orderingCost),
    Number(row.holdingCost),
    row.quantity,
    row.estimatedCost !== null ? Number(row.estimatedCost.toFixed(2)) : '—',
  ]);
  const exportHeaders = ['Product', 'Supplier', 'Current stock', 'Reorder point', 'Annual demand', 'Demand from',
    `Ordering cost (${currencySymbol})`, `Holding cost (${currencySymbol})`, 'Order quantity', `Estimated cost (${currencySymbol})`];

  const exportExcel = async () => {
    if (!ready.length) return;
    try {
      await exportReportWorkbook({
        title: 'Bulk Order List',
        subtitle: `Order quantities for ${ready.length} product${ready.length === 1 ? '' : 's'}`,
        fileName: `bulk-order-${new Date().toISOString().slice(0, 10)}`,
        summary: [
          { label: 'Products', value: ready.length },
          { label: 'Total units', value: totalUnits },
          { label: 'Estimated total cost', value: formatCurrency(totalCost) },
        ],
        sections: [{ title: 'Order list', headers: exportHeaders, rows: exportRows() }],
        scope: 'Order quantity = √(2 × annual demand × ordering cost ÷ holding cost), worked out for each product.',
        note: 'Planning list only — confirm supplier prices and availability before ordering. Estimated cost uses each product’s last Stock In price.',
        columnWidths: [26, 20, 12, 12, 14, 22, 14, 14, 14, 16],
      });
    } catch (error) {
      console.error('Could not export the bulk order list:', error);
      setMessage({ type: 'error', text: 'The Excel file could not be exported. Please try again.' });
    }
  };

  const exportPdf = () => {
    if (!ready.length) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      setMessage({ type: 'error', text: 'The list could not be opened. Allow pop-ups, then try again.' });
      return;
    }
    const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const body = ready.map((row) => `<tr>
      <td>${esc(row.name)}</td><td>${esc(row.supplierName || '—')}</td><td class="n">${esc(row.stock)}</td>
      <td class="n">${esc(Number(row.annualDemand).toLocaleString('en-PH'))}</td>
      <td class="n">${esc(formatCurrency(Number(row.orderingCost)))}</td><td class="n">${esc(formatCurrency(Number(row.holdingCost)))}</td>
      <td class="n"><b>${esc(row.quantity.toLocaleString('en-PH'))}</b></td>
      <td class="n">${esc(row.estimatedCost !== null ? formatCurrency(row.estimatedCost) : '—')}</td></tr>`).join('');
    printWindow.document.write(`<!doctype html><html lang="en"><head><meta charset="utf-8">
      <title>Bulk Order List</title>
      <style>
        * { box-sizing: border-box; } body { margin: 0; padding: 32px; color: #172033; font: 12px/1.5 Arial, sans-serif; }
        header { padding-bottom: 12px; border-bottom: 3px solid #176b57; margin-bottom: 16px; }
        .brand { color: #176b57; font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
        h1 { margin: 4px 0 2px; font-size: 22px; } .muted { color: #667085; font-size: 11px; }
        table { width: 100%; border-collapse: collapse; } th, td { padding: 6px 5px; border-bottom: 1px solid #e5e9ed; text-align: left; }
        th { color: #667085; font-weight: 600; font-size: 11px; } .n { text-align: right; }
        tfoot td { font-weight: 700; border-top: 2px solid #176b57; }
        .formula { margin-top: 14px; padding: 8px 10px; border: 1px solid #e5e9ed; border-radius: 8px; background: #fafbfc; }
        @media print { body { padding: 12mm; } }
      </style></head><body>
      <header><div class="brand">GGG Inventory Management System</div><h1>Bulk Order List</h1>
      <div class="muted">Generated ${esc(new Date().toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }))}</div></header>
      <table><thead><tr><th>Product</th><th>Supplier</th><th class="n">Stock</th><th class="n">Annual demand</th>
      <th class="n">Ordering cost</th><th class="n">Holding cost</th><th class="n">Order quantity</th><th class="n">Estimated cost</th></tr></thead>
      <tbody>${body}</tbody>
      <tfoot><tr><td colspan="6">Total</td><td class="n">${esc(totalUnits.toLocaleString('en-PH'))}</td><td class="n">${esc(formatCurrency(totalCost))}</td></tr></tfoot></table>
      <div class="formula">Order quantity = √(2 × annual demand × ordering cost ÷ holding cost), worked out for each product.
      Estimated cost uses each product's last Stock In price. Planning list only — confirm prices with the supplier before ordering.</div>
      <script>window.addEventListener('load', () => { window.focus(); window.print(); });</script></body></html>`);
    printWindow.document.close();
  };

  return createPortal(
    <div className="ra-modal-overlay" onClick={() => !saving && onClose()}>
      <div className="ra-modal ra-bulk-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="ra-bulk-title">
        <div className="ra-bulk-head">
          <div>
            <h3 id="ra-bulk-title">Bulk order — {items.length} product{items.length === 1 ? '' : 's'}</h3>
            <p className="ra-modal-sub">
              Each product gets its own order quantity: √(2 × annual demand × ordering cost ÷ holding cost) — the same as “Order Now”.
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
                <th>Product</th>
                <th>Stock</th>
                <th>Annual demand</th>
                <th>Ordering cost</th>
                <th>Holding cost</th>
                <th>Order quantity</th>
                <th>Estimated cost</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="ra-empty">Getting each product’s forecast…</td></tr>
              ) : computed.map((row) => (
                <tr key={row.id} className={row.quantity === null ? 'is-incomplete' : ''}>
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
                  <td data-label="Order quantity" className="ra-num">
                    {row.quantity !== null ? (
                      <span className="ra-product" title={`√(2 × ${row.annualDemand} × ${row.orderingCost} ÷ ${row.holdingCost}) = ${row.exact.toFixed(2)}`}>
                        <strong className="ra-bulk-qty">{row.quantity.toLocaleString('en-PH')}</strong>
                        {savedIds.has(row.id) && <small>Saved</small>}
                      </span>
                    ) : <span className="ra-muted">Fill in all 3</span>}
                  </td>
                  <td data-label="Estimated cost" className="ra-num">
                    {row.estimatedCost !== null ? formatCurrency(row.estimatedCost) : <span className="ra-muted">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!loading && (
          <div className="ra-bulk-totals">
            <span><b>{ready.length}</b> of {computed.length} ready</span>
            <span>Total: <b>{totalUnits.toLocaleString('en-PH')}</b> units</span>
            <span>Estimated cost: <b>{formatCurrency(totalCost)}</b>{anyWithoutPrice ? ' (some items have no Stock In price yet)' : ''}</span>
            {missing > 0 && <span className="ra-muted">{missing} still need costs</span>}
          </div>
        )}

        {message.text && <p className={message.type === 'error' ? 'ra-error' : 'ra-notice'} role="status">{message.text}</p>}

        <div className="ra-modal-actions">
          <button type="button" className="ra-order-btn" onClick={exportExcel} disabled={!ready.length || loading}>
            <Download size={13} aria-hidden="true" /> Excel
          </button>
          <button type="button" className="ra-order-btn" onClick={exportPdf} disabled={!ready.length || loading}>
            <FileText size={13} aria-hidden="true" /> PDF
          </button>
          <button type="button" className="ra-order-btn is-urgent" onClick={saveAll} disabled={!ready.length || loading || saving}>
            <Calculator size={13} aria-hidden="true" /> {saving ? 'Saving…' : `Save ${ready.length} to Reports`}
          </button>
        </div>
        <p className="ra-help">Planning only: this does not change stock or mark anything as ordered. Record a Stock In when the delivery arrives.</p>
      </div>
    </div>,
    document.body,
  );
}
