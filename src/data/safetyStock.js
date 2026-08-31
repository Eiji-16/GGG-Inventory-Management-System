/* Safety Stock Policy */
/* Owned by the Super Admin. Editable only from Settings → Advanced. */

export const DEFAULT_SAFETY_STOCK = 20;

/* Seed Policy */
export const SAFETY_STOCK_DEFAULTS = {
  'Premium Calfskin Band': { safetyStock: 25, annualDemand: 960 },
  'Water-Resistant Diver Strap': { safetyStock: 45, annualDemand: 1240 },
  'Precision Steel Chronograph': { safetyStock: 40, annualDemand: 1500 },
  'Sapphire Crystal Glass Face': { safetyStock: 60, annualDemand: 2100 },
};

/* Safety Point */
export const safetyPointFor = (row, policy = SAFETY_STOCK_DEFAULTS) => {
  const value = Number(policy?.[row?.productName]?.safetyStock);
  return Number.isFinite(value) ? value : DEFAULT_SAFETY_STOCK;
};

/* Annual Demand */
export const annualDemandFor = (productName, policy = SAFETY_STOCK_DEFAULTS) => (
  policy?.[productName]?.annualDemand ?? ''
);

/* Stock Status */
export const stockStatusFor = (row, policy = SAFETY_STOCK_DEFAULTS) => {
  const remaining = Number(row?.remainingStock);
  if (!Number.isFinite(remaining)) return null;
  const point = safetyPointFor(row, policy);
  if (remaining <= point * 0.5) return 'critical';
  if (remaining <= point) return 'low';
  return 'healthy';
};

export const STATUS_LABEL = { critical: 'Critical', low: 'Low', healthy: 'Healthy' };
