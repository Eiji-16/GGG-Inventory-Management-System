import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Camera, CheckCircle2, ClipboardCheck, ImagePlus, PackageCheck, Sparkles, SquarePen, Trash2, X } from 'lucide-react';
import apiFetch from '../../apiFetch';
import { buildForecastHandoff } from '../../utils/forecastHandoff';
import { orderQuantityFor } from './bulkOrder';
import { orderPresets } from '../../utils/orderPresets';
import { useCurrency } from '../../CurrencyContext';

/* ===== RECEIVED (Reorder List, remodel 2026-11-03) =====
   The system does not place orders — buying happens outside it. When the
   delivery arrives, this window records it:

   1. Quantity received — choose one:
        System suggested = Economic Order Quantity (forecast annual demand +
                           the product's saved ordering and holding costs);
                           without costs: back above the reorder point.
        Saved report     = the owner's quantity from the last "Save Report"
                           in the Restock Report (only when one was saved).
        Custom           = type the amount that actually arrived.
   2. Proof photo — a picture of the delivery (required).
   3. "Accomplish" — POST /api/reorder/receive. The quantity goes straight
      into Stock Control as a normal Stock In (same-day merge rules apply),
      the photo is kept with that entry, and the note records which choice
      was used and what the system suggested.
   Staff, Admin and Super Admin can all use it (Role Access → "Received"). */

const todayString = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60 * 1000).toISOString().slice(0, 10);
};
const MAX_PHOTO_MB = 5;

export default function ReceiveDelivery({ item, onClose, onReceived }) {
  const { currencySymbol } = useCurrency();
  const [loading, setLoading] = useState(true);
  const [eoq, setEoq] = useState(null);
  const [eoqNote, setEoqNote] = useState('');
  const [lastPrice, setLastPrice] = useState(null);
  const [monthlyDemand, setMonthlyDemand] = useState(null);
  const [savedReport, setSavedReport] = useState(null);   // { qty, suggested, savedAt, savedBy }
  const [choice, setChoice] = useState('custom');           // 'suggested' | 'report' | 'custom'
  const [form, setForm] = useState({ qty: '', unitPrice: '', date: todayString(), notes: 'Delivery received (Reorder List)' });
  const [photo, setPhoto] = useState(null);                 // File
  const [preview, setPreview] = useState('');
  const [dragging, setDragging] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);

  useEffect(() => {
    let active = true;
    (async () => {
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

      let report = null;
      try {
        const response = await fetch('/api/restock-report', { headers: { Accept: 'application/json' }, cache: 'no-store' });
        const saved = response.ok ? await response.json() : {};
        report = saved && saved[item.id] && Number(saved[item.id].qty) > 0 ? saved[item.id] : null;
      } catch {
        /* no saved report: the other two choices still work */
      }

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
      setSavedReport(report);
      const monthly = handoff ? Number(handoff.adjustedForecast) : (history > 0 ? history / 12 : null);
      setMonthlyDemand(Number.isFinite(monthly) && monthly > 0 ? monthly : null);
      if (quantity !== null) {
        setEoq({ quantity, annualDemand, source: handoff ? 'forecast' : 'history' });
      } else if (!(annualDemand > 0)) {
        setEoqNote('No sales history yet, so the Economic Order Quantity cannot be worked out.');
      } else {
        setEoqNote('No ordering or holding cost is saved for this product, so the Economic Order Quantity cannot be worked out.');
      }
      const first = orderPresets({ eoq: quantity, stock: item.stock, reorderPoint: item.reorderPoint, monthlyDemand: monthly })
        .find((option) => option.key === 'eoq' || option.key === 'reorder');
      // Start from the saved report when there is one, else the suggestion.
      const startChoice = report ? 'report' : (first ? 'suggested' : 'custom');
      setChoice(startChoice);
      setForm((prev) => ({
        ...prev,
        qty: startChoice === 'report' ? String(report.qty) : (first ? String(first.qty) : prev.qty),
        unitPrice: price !== null ? String(price) : prev.unitPrice,
      }));
      setLoading(false);
    })();
    return () => { active = false; };
  }, [item]);

  // Free the photo preview when it changes or the window closes.
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape' && !saving) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [saving, onClose]);

  const suggestion = orderPresets({
    eoq: eoq?.quantity ?? null,
    stock: item.stock,
    reorderPoint: item.reorderPoint,
    monthlyDemand,
  }).find((option) => option.key === 'eoq' || option.key === 'reorder') || null;

  const pick = (next) => {
    setChoice(next);
    setError('');
    if (next === 'suggested' && suggestion) setForm((prev) => ({ ...prev, qty: String(suggestion.qty) }));
    if (next === 'report' && savedReport) setForm((prev) => ({ ...prev, qty: String(savedReport.qty) }));
    if (next === 'custom') window.setTimeout(() => document.getElementById('ra-receive-qty')?.focus(), 0);
  };

  const update = (field) => (event) => {
    if (field === 'qty') setChoice('custom');
    setForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const takePhoto = (file) => {
    if (!file) return;
    if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) {
      setError('The proof must be a picture (JPG, PNG, WEBP or GIF).');
      return;
    }
    if (file.size > MAX_PHOTO_MB * 1024 * 1024) {
      setError(`The photo is too large. Use a picture up to ${MAX_PHOTO_MB} MB.`);
      return;
    }
    setError('');
    setPhoto(file);
    setPreview(URL.createObjectURL(file));
  };
  const removePhoto = () => {
    setPhoto(null);
    setPreview('');
    if (fileRef.current) fileRef.current.value = '';
  };

  const qtyNumber = Number(form.qty);
  const qtyValid = Number.isInteger(qtyNumber) && qtyNumber >= 1 && qtyNumber <= 9999;
  const stockAfter = qtyValid ? item.stock + qtyNumber : null;
  const lowLevel = item.points?.low;
  const ready = qtyValid && photo && form.unitPrice !== '' && Number(form.unitPrice) >= 0;

  const submit = async (event) => {
    event.preventDefault();
    if (saving) return;
    if (!qtyValid) { setError('Enter the quantity received (1 to 9,999).'); return; }
    if (form.unitPrice === '' || !(Number(form.unitPrice) >= 0)) { setError('Enter the unit price (0 or more).'); return; }
    if (!form.date || form.date > todayString()) { setError('The date cannot be in the future.'); return; }
    if (!photo) { setError('Add a photo of the delivery as proof that it arrived.'); return; }

    setSaving(true);
    setError('');
    const data = new FormData();
    data.append('productId', item.id);
    data.append('productName', item.name);
    data.append('qty', String(qtyNumber));
    data.append('unitPrice', String(Number(form.unitPrice)));
    data.append('date', form.date);
    data.append('notes', form.notes.trim());
    data.append('choice', choice);
    if (suggestion) data.append('suggestedQty', String(suggestion.qty));
    data.append('photo', photo);
    try {
      const response = await apiFetch('/api/reorder/receive', { method: 'POST', body: data });
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

  const options = [
    suggestion && {
      key: 'suggested',
      Icon: Sparkles,
      title: 'System suggested',
      qty: suggestion.qty,
      hint: suggestion.key === 'eoq' ? 'Economic Order Quantity' : 'Back above the reorder point',
    },
    savedReport && {
      key: 'report',
      Icon: ClipboardCheck,
      title: 'Saved report',
      qty: savedReport.qty,
      hint: `Restock Report${savedReport.savedAt ? ` · ${new Date(`${savedReport.savedAt}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}` : ''}`,
    },
    {
      key: 'custom',
      Icon: SquarePen,
      title: 'Custom',
      qty: choice === 'custom' && form.qty ? form.qty : '—',
      hint: 'Type what arrived',
    },
  ].filter(Boolean);

  return createPortal(
    <div className="ra-modal-overlay" onClick={() => !saving && onClose()}>
      <form className="ra-modal ra-receive ra-receive-v2" onClick={(event) => event.stopPropagation()} onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="ra-receive-title">
        <div className="ra-receive-head">
          <span className="ra-receive-icon" aria-hidden="true"><PackageCheck size={18} /></span>
          <div>
            <h3 id="ra-receive-title">Received: {item.name}</h3>
            <p className="ra-modal-sub">{item.stock} on hand now · {item.status}. The quantity goes straight to Stock Control as a Stock In.</p>
          </div>
          <button type="button" className="ra-bulk-close" onClick={onClose} disabled={saving} aria-label="Close"><X size={16} /></button>
        </div>

        {loading ? (
          <div className="ra-receive-loading" role="status"><span className="ra-receive-spinner" aria-hidden="true" /> Working out the suggested quantity…</div>
        ) : (
          <>
            <section className="ra-receive-section">
              <h4><span>1</span> Quantity received</h4>
              <div className="ra-choice-grid" role="radiogroup" aria-label="Quantity received">
                {options.map(({ key, Icon, title, qty, hint }) => (
                  <button
                    key={key}
                    type="button"
                    role="radio"
                    aria-checked={choice === key}
                    className={`ra-choice${choice === key ? ' is-active' : ''}`}
                    onClick={() => pick(key)}
                  >
                    <span className="ra-choice-top"><Icon size={13} aria-hidden="true" /> {title}</span>
                    <strong>{qty}</strong>
                    <small>{hint}</small>
                  </button>
                ))}
              </div>
              <div className="ra-receive-grid">
                <div className="ra-receive-field">
                  <label htmlFor="ra-receive-qty">Quantity</label>
                  <input id="ra-receive-qty" type="number" min="1" max="9999" step="1" inputMode="numeric" value={form.qty} onChange={update('qty')} required />
                  <small className="hint-text">
                    {choice === 'suggested' && suggestion ? `${suggestion.label}: ${suggestion.hint}.` : null}
                    {choice === 'report' && savedReport ? `From the Restock Report${savedReport.savedBy ? ` saved by ${savedReport.savedBy}` : ''}${savedReport.suggested != null ? ` (system suggested ${savedReport.suggested})` : ''}.` : null}
                    {choice === 'custom' ? `Your own amount${suggestion ? ` (the system suggested ${suggestion.qty})` : ''}.` : null}
                    {!eoq && eoqNote ? ` ${eoqNote}` : ''}
                  </small>
                </div>
                <div className="ra-receive-field">
                  <label htmlFor="ra-receive-price">Unit price ({currencySymbol})</label>
                  <input id="ra-receive-price" type="number" min="0" step="0.01" inputMode="decimal" value={form.unitPrice} onChange={update('unitPrice')} required />
                  <small className="hint-text">{lastPrice !== null ? 'From the last Stock In.' : 'Type the price paid per unit.'}</small>
                </div>
                <div className="ra-receive-field">
                  <label htmlFor="ra-receive-date">Date received</label>
                  <input id="ra-receive-date" type="date" max={todayString()} value={form.date} onChange={update('date')} required />
                </div>
                <div className="ra-receive-field">
                  <label htmlFor="ra-receive-notes">Note</label>
                  <input id="ra-receive-notes" type="text" maxLength={200} value={form.notes} onChange={update('notes')} />
                </div>
              </div>
            </section>

            <section className="ra-receive-section">
              <h4><span>2</span> Proof photo <em>required</em></h4>
              {preview ? (
                <div className="ra-proof-preview">
                  <img src={preview} alt="Delivery proof preview" />
                  <div>
                    <strong><CheckCircle2 size={14} aria-hidden="true" /> Photo added</strong>
                    <small>{photo?.name} · {(photo?.size / 1024 / 1024).toFixed(2)} MB</small>
                    <span className="ra-proof-actions">
                      <button type="button" className="ra-order-btn" onClick={() => fileRef.current?.click()} disabled={saving}><Camera size={13} aria-hidden="true" /> Change</button>
                      <button type="button" className="ra-order-btn" onClick={removePhoto} disabled={saving}><Trash2 size={13} aria-hidden="true" /> Remove</button>
                    </span>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className={`ra-proof-drop${dragging ? ' is-dragging' : ''}`}
                  onClick={() => fileRef.current?.click()}
                  onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(event) => { event.preventDefault(); setDragging(false); takePhoto(event.dataTransfer.files?.[0]); }}
                >
                  <ImagePlus size={22} aria-hidden="true" />
                  <strong>Add a photo of the delivery</strong>
                  <small>Click to choose or take a picture, or drop it here · JPG, PNG, WEBP · up to {MAX_PHOTO_MB} MB</small>
                </button>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                capture="environment"
                hidden
                onChange={(event) => takePhoto(event.target.files?.[0])}
              />
            </section>

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
          <button type="submit" className="ra-order-btn is-urgent ra-accomplish-btn" disabled={saving || loading || !ready} title={!photo ? 'Add the proof photo first' : 'Record the delivery as a Stock In'}>
            <CheckCircle2 size={14} aria-hidden="true" /> {saving ? 'Saving…' : 'Accomplish'}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
