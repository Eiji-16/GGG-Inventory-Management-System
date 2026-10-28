import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { PackageCheck } from 'lucide-react';
import apiFetch from '../../apiFetch';
import { buildForecastHandoff } from '../../utils/forecastHandoff';
import { orderQuantityFor } from './bulkOrder';
import { orderPresets } from '../../utils/orderPresets';
import { useCurrency } from '../../CurrencyContext';

/* ===== MARK AS RECEIVED (Reorder List) =====
   The system does not place orders — the Super Admin contacts the supplier
   outside the system. When the delivery arrives, this window records it as a
   normal Stock In (the same POST /api/stock-movements that Stock Control
   uses), so stock goes up and the product leaves the Reorder List by itself.

   Pre-filled, both can be changed before saving:
     Quantity   = Economic Order Quantity, worked out exactly like Bulk order
                  (forecast annual demand + the product's saved ordering and
                  holding costs). Left empty when it cannot be worked out.
     Unit price = the product's last Stock In price (can also be edited later
                  in Stock Control). */

const todayString = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60 * 1000).toISOString().slice(0, 10);
};

export default function ReceiveDelivery({ item, onClose, onReceived }) {
  const { currencySymbol } = useCurrency();
  const [loading, setLoading] = useState(true);
  const [eoq, setEoq] = useState(null);           // { quantity, annualDemand, source } or null
  const [eoqNote, setEoqNote] = useState('');
  const [lastPrice, setLastPrice] = useState(null);
  const [monthlyDemand, setMonthlyDemand] = useState(null);   // for "Cover next month"
  const [preset, setPreset] = useState('custom');            // which preset filled the box
  const [form, setForm] = useState({
    qty: '',
    unitPrice: '',
    date: todayString(),
    notes: 'Delivery received (Reorder List)',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    (async () => {
      // 1. Last Stock In price (the list is newest first).
      let price = null;
      try {
        const response = await fetch('/api/stock-movements', { headers: { Accept: 'application/json' }, cache: 'no-store' });
        const movements = response.ok ? await response.json() : [];
        const lastIn = (Array.isArray(movements) ? movements : [])
          .find((movement) => movement.productId === item.id && movement.type === 'Stock In' && movement.unitPrice != null);
        price = lastIn ? Number(lastIn.unitPrice) : null;
      } catch {
        /* the price can be typed in */
      }

      // 2. Economic Order Quantity — same inputs as Order Now / Bulk order.
      const { handoff } = await buildForecastHandoff(item.id, item.name);
      const history = Number(item.annualDemand || item.demandFromHistory) || 0;
      const annualDemand = handoff ? handoff.annualDemand : history;
      const exact = orderQuantityFor({
        annualDemand: annualDemand > 0 ? annualDemand : '',
        orderingCost: item.orderingCost ?? '',
        holdingCost: item.holdingCost ?? '',
      });
      const quantity = exact === null ? null : Math.max(1, Math.round(exact));

      if (!active) return;
      setLastPrice(price);
      // Next month's demand: the forecast, else the last 12 months ÷ 12.
      const monthly = handoff ? Number(handoff.adjustedForecast) : (history > 0 ? history / 12 : null);
      setMonthlyDemand(Number.isFinite(monthly) && monthly > 0 ? monthly : null);
      if (quantity !== null) {
        setEoq({ quantity, annualDemand, source: handoff ? 'forecast' : 'history' });
      } else if (!(annualDemand > 0)) {
        setEoqNote('No sales history yet, so the Economic Order Quantity cannot be worked out.');
      } else {
        setEoqNote('No ordering or holding cost is saved for this product, so the Economic Order Quantity cannot be worked out.');
      }
      // Start from the Economic Order Quantity, else "Back above reorder point".
      const first = orderPresets({ eoq: quantity, stock: item.stock, reorderPoint: item.reorderPoint, monthlyDemand: monthly })[0];
      setPreset(first ? first.key : 'custom');
      setForm((prev) => ({
        ...prev,
        qty: first ? String(first.qty) : prev.qty,
        unitPrice: price !== null ? String(price) : prev.unitPrice,
      }));
      setLoading(false);
    })();
    return () => { active = false; };
  }, [item]);

  const update = (field) => (event) => {
    if (field === 'qty') setPreset('custom');   // typed by hand
    setForm((prev) => ({ ...prev, [field]: event.target.value }));
  };
  const presets = orderPresets({
    eoq: eoq?.quantity ?? null,
    stock: item.stock,
    reorderPoint: item.reorderPoint,
    monthlyDemand,
  });
  const choosePreset = (option) => {
    setPreset(option.key);
    setForm((prev) => ({ ...prev, qty: String(option.qty) }));
  };

  const qtyNumber = Number(form.qty);
  const qtyValid = Number.isInteger(qtyNumber) && qtyNumber >= 1;
  const stockAfter = qtyValid ? item.stock + qtyNumber : null;
  const lowLevel = item.points?.low;

  const submit = async (event) => {
    event.preventDefault();
    if (saving) return;
    if (!qtyValid) { setError('Enter the quantity received (1 or more).'); return; }
    if (form.unitPrice === '' || !(Number(form.unitPrice) >= 0)) { setError('Enter the unit price (0 or more).'); return; }
    if (!form.date || form.date > todayString()) { setError('The date cannot be in the future.'); return; }

    setSaving(true);
    setError('');
    try {
      const response = await apiFetch('/api/stock-movements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: item.id,
          productName: item.name,
          type: 'Stock In',
          qty: qtyNumber,
          unitPrice: Number(form.unitPrice),
          date: form.date,
          notes: form.notes.trim() || null,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = result.errors ? Object.values(result.errors).flat()[0] : result.message;
        throw new Error(message || `Could not record the delivery (${response.status}).`);
      }
      onReceived?.({ id: item.id, name: item.name, qty: qtyNumber, merged: Boolean(result.merged) });
    } catch (saveError) {
      setError(saveError.message || 'Could not record the delivery.');
      setSaving(false);
    }
  };

  return createPortal(
    <div className="ra-modal-overlay" onClick={() => !saving && onClose()}>
      <form className="ra-modal ra-receive" onClick={(event) => event.stopPropagation()} onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="ra-receive-title">
        <h3 id="ra-receive-title"><PackageCheck size={16} aria-hidden="true" /> Mark {item.name} as received</h3>
        <p className="ra-modal-sub">
          Records the delivery as a Stock In. {item.stock} on hand now · {item.status}.
        </p>

        {loading ? (
          <p className="ra-modal-sub" role="status">Working out the Economic Order Quantity…</p>
        ) : (
          <>
            {/* Preset quantities: one click fills the box (it can still be changed). */}
            <div className="ra-presets" role="radiogroup" aria-label="Preset quantity">
              {presets.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  role="radio"
                  aria-checked={preset === option.key}
                  className={`ra-preset${preset === option.key ? ' is-active' : ''}`}
                  onClick={() => choosePreset(option)}
                  title={option.hint}
                >
                  <span>{option.label}</span>
                  <strong>{option.qty}</strong>
                </button>
              ))}
              <button
                type="button"
                role="radio"
                aria-checked={preset === 'custom'}
                className={`ra-preset${preset === 'custom' ? ' is-active' : ''}`}
                onClick={() => { setPreset('custom'); document.getElementById('ra-receive-qty')?.focus(); }}
                title="Type the amount that actually arrived"
              >
                <span>Custom</span>
                <strong>✎</strong>
              </button>
            </div>
            <div className="ra-receive-grid">
              <div className="ra-receive-field">
                <label htmlFor="ra-receive-qty">Quantity received</label>
                <input id="ra-receive-qty" type="number" min="1" max="9999" step="1" inputMode="numeric" value={form.qty} onChange={update('qty')} autoFocus required />
                <small>
                  {preset !== 'custom'
                    ? `${presets.find((option) => option.key === preset)?.hint || ''}. Change it if a different amount arrived.`
                    : 'Your own amount — type what actually arrived.'}
                  {!eoq && eoqNote ? ` ${eoqNote}` : ''}
                </small>
              </div>
              <div className="ra-receive-field">
                <label htmlFor="ra-receive-price">Unit price ({currencySymbol})</label>
                <input id="ra-receive-price" type="number" min="0" step="0.01" inputMode="decimal" value={form.unitPrice} onChange={update('unitPrice')} required />
                <small>{lastPrice !== null ? 'From the last Stock In. You can also edit it later in Stock Control.' : 'No earlier Stock In price — type the price paid per unit.'}</small>
              </div>
              <div className="ra-receive-field">
                <label htmlFor="ra-receive-date">Date received</label>
                <input id="ra-receive-date" type="date" max={todayString()} value={form.date} onChange={update('date')} required />
              </div>
              <div className="ra-receive-field">
                <label htmlFor="ra-receive-notes">Note</label>
                <input id="ra-receive-notes" type="text" maxLength={255} value={form.notes} onChange={update('notes')} />
              </div>
            </div>
            {stockAfter !== null && (
              <p className={`ra-receive-after ${lowLevel != null && stockAfter > lowLevel ? 'is-ok' : 'is-still-low'}`}>
                Stock after receiving: <strong>{stockAfter}</strong>
                {lowLevel != null && (stockAfter > lowLevel
                  ? ` — above the low-stock level (${lowLevel}), so it leaves the Reorder List.`
                  : ` — still at or below the low-stock level (${lowLevel}), so it stays on the Reorder List.`)}
              </p>
            )}
          </>
        )}

        {error && <p className="ra-error" role="alert">{error}</p>}
        <div className="ra-modal-actions">
          <button type="button" className="ra-order-btn" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" className="ra-order-btn is-urgent" disabled={saving || loading}>
            {saving ? 'Saving…' : 'Record Stock In'}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
