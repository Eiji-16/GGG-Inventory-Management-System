import apiFetch from '../apiFetch';

/* ==========================================================================
   Forecast → EOQ handoff (used by "Order Now" and Stock Control's EOQ shortcut)

   Fetches the product's current WMA forecast (monthly, seasonal adjustment
   included) and turns it into the same "forecast-eoq" handoff that the
   Forecasting page's Compute EOQ button sends, so the server re-verifies it.

   Annual demand conversion (done once, here):
       annual demand = round(adjusted forecast per month × 12)
   The forecast is a per-month figure, so it is multiplied by 12 exactly once.
   ========================================================================== */

const ANNUAL_PERIODS = { week: 52, month: 12, year: 1 };

/**
 * @returns {Promise<{handoff: object|null, reason: string}>}
 *   handoff is null when no forecast can be made (e.g. not enough sales yet);
 *   reason then explains why, for a fallback message.
 */
export async function buildForecastHandoff(productId, productName, periodType = 'month') {
  try {
    const response = await apiFetch('/api/forecasts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId, periodType }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = data.errors ? Object.values(data.errors).flat()[0] : data.message;
      return { handoff: null, reason: message || `Forecast unavailable (${response.status}).` };
    }

    const annualPeriods = ANNUAL_PERIODS[periodType] ?? 12;
    const adjustedForecast = Number(data.adjustedForecast);
    const annualDemand = Math.round(adjustedForecast * annualPeriods);
    if (!Number.isFinite(annualDemand) || annualDemand <= 0) {
      return { handoff: null, reason: 'The forecast is zero, so it cannot be used for EOQ.' };
    }

    return {
      reason: '',
      handoff: {
        type: 'forecast-eoq',
        productId,
        productName,
        annualDemand,
        baseForecast: Number(data.baseForecast),
        adjustedForecast,
        seasonalEnabled: Boolean(data.seasonalEnabled),
        seasonalEvent: data.seasonalEnabled
          ? (data.seasonalEvents || []).map((item) => item.name).join(', ')
          : null,
        adjustmentPct: Number(data.adjustmentPct) || 0,
        periodType,
        forecastPeriod: data.forecastPeriod,
        annualPeriods,
        source: 'forecast',
        createdAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    return { handoff: null, reason: error.message || 'Forecast unavailable.' };
  }
}
