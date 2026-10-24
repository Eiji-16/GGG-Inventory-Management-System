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
  const point = reorderPointFor(row, policy);
  if (remaining <= 0) return 'outofstock';
  if (remaining <= point * 0.5) return 'critical';
  if (remaining <= point) return 'low';
  return 'healthy';
};

export const STATUS_LABEL = { outofstock: 'Out of Stock', critical: 'Critical', low: 'Low', healthy: 'Healthy' };
