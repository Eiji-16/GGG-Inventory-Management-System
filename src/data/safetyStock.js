/* Safety Stock Policy */
/* Owned by the Super Admin. Editable only from Settings → Advanced. */

/* DEFAULT_SAFETY_STOCK — fallback safety-stock level for any product not in the policy below.
   BACKEND: a single config value; store in a `settings` table or app config. */
export const DEFAULT_SAFETY_STOCK = 20;

/* Empty until the saved per-product policies load from the server. (The old
   sample entries from a demo store were removed.) */
export const SAFETY_STOCK_DEFAULTS = {};

export const policyFor = (row, policy = SAFETY_STOCK_DEFAULTS) => (
  policy?.[row?.productId] || policy?.[row?.productName] || {}
);

/* Safety Point */
export const safetyPointFor = (row, policy = SAFETY_STOCK_DEFAULTS) => {
  const configuredValue = policyFor(row, policy).safetyStock;
  if (configuredValue !== null && configuredValue !== undefined && configuredValue !== '') {
    const configuredSafetyStock = Number(configuredValue);
    if (Number.isFinite(configuredSafetyStock)) return configuredSafetyStock;
  }
  const productSafetyStock = Number(row?.safetyStock);
  return Number.isFinite(productSafetyStock) ? productSafetyStock : DEFAULT_SAFETY_STOCK;
};

export const reorderPointFor = (row, policy = SAFETY_STOCK_DEFAULTS) => {
  const safetyStock = safetyPointFor(row, policy);
  const configured = policyFor(row, policy);
  // Annual demand = real sales (last 12 months), never a typed policy value.
  const annualDemandValue = row?.annualDemand !== null && row?.annualDemand !== undefined
    ? row.annualDemand
    : row?.demandFromHistory;
  const annualDemand = Number(annualDemandValue);
  const configuredLeadTime = configured.leadTimeDays;
  const leadTimeValue = configuredLeadTime !== '' && configuredLeadTime !== null && configuredLeadTime !== undefined
    ? configuredLeadTime
    : row?.leadTimeDays;
  const leadTimeDays = Number(leadTimeValue);

  if (
    !Number.isFinite(annualDemand) || annualDemand <= 0 ||
    leadTimeValue === '' || leadTimeValue === null || leadTimeValue === undefined ||
    !Number.isFinite(leadTimeDays) || leadTimeDays < 0
  ) {
    return safetyStock;
  }

  return Math.ceil(safetyStock + (annualDemand / 365) * leadTimeDays);
};

/* Annual demand from the policy was removed (demand comes from real sales).
   Kept so older callers still work; always empty now. */
export const annualDemandFor = () => '';

/* Stock Status */
export const stockStatusFor = (row, policy = SAFETY_STOCK_DEFAULTS) => {
  const remaining = Number(row?.remainingStock);
  if (!Number.isFinite(remaining)) return null;
  // Same rule as the server (ReorderPointService::statusFor).
  const { low, critical } = statusPointsFor(row, policy);
  if (remaining <= 0) return 'outofstock';
  if (remaining <= critical) return 'critical';
  if (remaining <= low) return 'low';
  return 'healthy';
};

/* Where a product turns Low and Critical (Settings → Advanced Options):
   auto   → Low at the reorder point, Critical at safety stock
   manual → the owner's own Low / Critical points */
export const statusPointsFor = (row, policy = SAFETY_STOCK_DEFAULTS) => {
  const configured = policyFor(row, policy);
  const low = Number(configured.lowPoint);
  const critical = Number(configured.criticalPoint);
  if (configured.statusMode === 'manual'
    && configured.lowPoint !== '' && configured.lowPoint != null && Number.isFinite(low)
    && configured.criticalPoint !== '' && configured.criticalPoint != null && Number.isFinite(critical)) {
    return { mode: 'manual', low, critical };
  }
  return { mode: 'auto', low: reorderPointFor(row, policy), critical: safetyPointFor(row, policy) };
};

/* Does this sale leave the product at or below its safety stock (the units
   kept in reserve)? Used for the "proceed with this sale?" confirmation. */
export const safetyReachedFor = (row, before, after, policy = SAFETY_STOCK_DEFAULTS) => {
  if (!Number.isFinite(Number(before)) || !Number.isFinite(Number(after)) || Number(after) >= Number(before)) return null;
  const safety = safetyPointFor(row, policy);
  if (Number(after) > safety) return null;
  return { level: Number(after) <= 0 ? 'out' : 'critical', safety, after: Number(after), before: Number(before) };
};

/* Did this change take the product into Critical (or to zero)? Used by the
   safety-stock handler: warn before saving, banner after. Never blocks. */
export const safetyCrossingFor = (row, before, after, policy = SAFETY_STOCK_DEFAULTS) => {
  if (!Number.isFinite(Number(before)) || !Number.isFinite(Number(after)) || Number(after) >= Number(before)) return null;
  const safety = safetyPointFor(row, policy);
  if (Number(after) <= 0 && Number(before) > 0) return { level: 'out', safety, after: Number(after) };
  if (Number(after) <= safety && Number(before) > safety) return { level: 'critical', safety, after: Number(after) };
  return null;
};

export const STATUS_LABEL = { outofstock: 'Out of Stock', critical: 'Critical', low: 'Low', healthy: 'Healthy' };
