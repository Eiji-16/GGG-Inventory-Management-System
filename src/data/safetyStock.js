/* Safety Stock Policy */
/* Owned by the Super Admin. Editable only from Settings → Advanced. */

/* DEFAULT_SAFETY_STOCK — fallback safety-stock level for any product not in the policy below.
   BACKEND: a single config value; store in a `settings` table or app config. */
export const DEFAULT_SAFETY_STOCK = 20;

/* Fallback policy used only until the persisted per-product records load. */
export const SAFETY_STOCK_DEFAULTS = {
  'Premium Calfskin Band': { safetyStock: 25, annualDemand: 960, leadTimeDays: '', orderCycleDays: '' },
  'Water-Resistant Diver Strap': { safetyStock: 45, annualDemand: 1240, leadTimeDays: '', orderCycleDays: '' },
  'Precision Steel Chronograph': { safetyStock: 40, annualDemand: 1500, leadTimeDays: '', orderCycleDays: '' },
  'Sapphire Crystal Glass Face': { safetyStock: 60, annualDemand: 2100, leadTimeDays: '', orderCycleDays: '' },
};

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
  const annualDemandValue = row?.annualDemand !== null && row?.annualDemand !== undefined
    ? row.annualDemand
    : configured.annualDemand ?? row?.demandFromHistory;
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

/* Annual Demand */
export const annualDemandFor = (productId, policy = SAFETY_STOCK_DEFAULTS, productName = '') => (
  policyFor({ productId, productName }, policy).annualDemand ?? ''
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
  const point = reorderPointFor(row, policy);
  if (remaining <= 0) return 'outofstock';
  if (remaining <= point * 0.5) return 'critical';
  if (remaining <= point) return 'low';
  return 'healthy';
};

export const STATUS_LABEL = { outofstock: 'Out of Stock', critical: 'Critical', low: 'Low', healthy: 'Healthy' };
