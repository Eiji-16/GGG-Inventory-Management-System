/* Safety Stock Policy */
/* Owned by the Super Admin. Editable only from Settings → Advanced. */

/* DEFAULT_SAFETY_STOCK — fallback safety-stock level for any product not in the policy below.
   BACKEND: a single config value; store in a `settings` table or app config. */
export const DEFAULT_SAFETY_STOCK = 20;

/* SAFETY_STOCK_DEFAULTS — per-product policy: reorder threshold, yearly demand,
   lead time, and order cycle.
   This is the shared data authority — Stock Control reads it for alerts, and the Auto Calculator
   pulls annualDemand from it during the EOQ handoff.
   BACKEND: GET /api/safety-stock → the `safety_stock` table keyed by product.
   Keys are product names now; switch to product_id once products have real IDs. */
export const SAFETY_STOCK_DEFAULTS = {
  'Premium Calfskin Band': { safetyStock: 25, annualDemand: 960, leadTimeDays: '', orderCycleDays: '' },
  'Water-Resistant Diver Strap': { safetyStock: 45, annualDemand: 1240, leadTimeDays: '', orderCycleDays: '' },
  'Precision Steel Chronograph': { safetyStock: 40, annualDemand: 1500, leadTimeDays: '', orderCycleDays: '' },
  'Sapphire Crystal Glass Face': { safetyStock: 60, annualDemand: 2100, leadTimeDays: '', orderCycleDays: '' },
};

/* Safety Point */
export const safetyPointFor = (row, policy = SAFETY_STOCK_DEFAULTS) => {
  if (row?.safetyStock !== null && row?.safetyStock !== undefined && row.safetyStock !== '') {
    const productSafetyStock = Number(row.safetyStock);
    if (Number.isFinite(productSafetyStock)) return productSafetyStock;
  }
  const value = Number(policy?.[row?.productName]?.safetyStock);
  return Number.isFinite(value) ? value : DEFAULT_SAFETY_STOCK;
};

/* Annual Demand */
export const annualDemandFor = (productName, policy = SAFETY_STOCK_DEFAULTS) => (
  policy?.[productName]?.annualDemand ?? ''
);

/* Maximum stock target = safety stock + expected demand during lead time and order cycle. */
export const maximumInventoryFor = (annualDemand, safetyStock, leadTimeDays, orderCycleDays) => {
  const demand = Number(annualDemand);
  const safety = Number(safetyStock);
  const leadTime = Number(leadTimeDays);
  const orderCycle = Number(orderCycleDays);

  if (
    annualDemand === '' || annualDemand === null || annualDemand === undefined ||
    leadTimeDays === '' || leadTimeDays === null || leadTimeDays === undefined ||
    orderCycleDays === '' || orderCycleDays === null || orderCycleDays === undefined ||
    !Number.isFinite(demand) || demand <= 0 ||
    !Number.isFinite(safety) || safety < 0 ||
    !Number.isFinite(leadTime) || leadTime < 0 ||
    !Number.isFinite(orderCycle) || orderCycle <= 0
  ) {
    return null;
  }

  return Math.ceil(safety + (demand / 365) * (leadTime + orderCycle));
};

/* Stock Status */
export const stockStatusFor = (row, policy = SAFETY_STOCK_DEFAULTS) => {
  const remaining = Number(row?.remainingStock);
  if (!Number.isFinite(remaining)) return null;
  const point = safetyPointFor(row, policy);
  if (remaining <= 0) return 'outofstock';
  if (remaining <= point * 0.5) return 'critical';
  if (remaining <= point) return 'low';
  return 'healthy';
};

export const STATUS_LABEL = { outofstock: 'Out of Stock', critical: 'Critical', low: 'Low', healthy: 'Healthy' };
