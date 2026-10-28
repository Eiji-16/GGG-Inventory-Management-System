/* ==========================================================================
   Preset order quantities (Reorder List → Received, and Bulk order)

   The system suggests how many units to order; buying happens outside it.
   Each preset is worked out from data the system already has:

     Economic Order Quantity   √(2 × annual demand × ordering cost ÷ holding cost)
                               — needs the product's ordering and holding cost
     Back above reorder point  just enough to get stock above the reorder point
                               = reorder point + 1 − stock on hand
     Cover next month          next month's forecast, plus whatever is still
                               missing to reach the reorder point
                               = ⌈monthly forecast⌉ + max(0, reorder point − stock)

   A preset is only offered when its number can be worked out (no guesses).
   ========================================================================== */

export const PRESET_LABELS = {
  eoq: 'Economic Order Quantity',
  reorder: 'Back above reorder point',
  month: 'Cover next month',
};

export function orderPresets({ eoq = null, stock = 0, reorderPoint = null, monthlyDemand = null }) {
  const onHand = Math.max(0, Number(stock) || 0);
  const point = Number(reorderPoint);
  const monthly = Number(monthlyDemand);
  const presets = [];

  if (Number.isFinite(eoq) && eoq > 0) {
    presets.push({
      key: 'eoq',
      label: PRESET_LABELS.eoq,
      qty: Math.max(1, Math.round(eoq)),
      hint: 'Cheapest amount per order: √(2 × annual demand × ordering cost ÷ holding cost)',
    });
  }
  if (Number.isFinite(point) && point >= 0) {
    const qty = Math.max(1, point + 1 - onHand);
    presets.push({
      key: 'reorder',
      label: PRESET_LABELS.reorder,
      qty,
      hint: `Stock ${onHand} → ${onHand + qty}, just above the reorder point (${point})`,
    });
  }
  if (Number.isFinite(monthly) && monthly > 0) {
    const shortfall = Number.isFinite(point) ? Math.max(0, point - onHand) : 0;
    const qty = Math.max(1, Math.ceil(monthly) + shortfall);
    presets.push({
      key: 'month',
      label: PRESET_LABELS.month,
      qty,
      hint: `Next month's forecast (${Math.ceil(monthly)})${shortfall ? ` + ${shortfall} to reach the reorder point` : ''}`,
    });
  }
  return presets;
}
