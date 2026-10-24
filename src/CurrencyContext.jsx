import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import apiFetch from './apiFetch';

export const CURRENCIES = [
  { code: 'USD', label: 'USD ($) - US Dollar' },
  { code: 'PHP', label: 'PHP (₱) - Philippine Peso' },
  { code: 'EUR', label: 'EUR (€) - Euro' },
  { code: 'GBP', label: 'GBP (£) - British Pound' },
  { code: 'JPY', label: 'JPY (¥) - Japanese Yen' },
];

// System-wide currency (Settings → Currency, saved on the server for every
// account). PHP is the default for Global Growth Guide.
const DEFAULT_CURRENCY = 'PHP';
const CURRENCY_LOCALES = {
  USD: 'en-US',
  PHP: 'en-PH',
  EUR: 'de-DE',
  GBP: 'en-GB',
  JPY: 'en-US',
};
const CurrencyContext = createContext(null);

export function formatCurrency(value, currency = DEFAULT_CURRENCY) {
  const supportedCurrency = CURRENCIES.some((option) => option.code === currency)
    ? currency
    : DEFAULT_CURRENCY;

  return new Intl.NumberFormat(CURRENCY_LOCALES[supportedCurrency], {
    style: 'currency',
    currency: supportedCurrency,
  }).format(Number(value ?? 0));
}

export function getCurrencySymbol(currency = DEFAULT_CURRENCY) {
  const supportedCurrency = CURRENCIES.some((option) => option.code === currency)
    ? currency
    : DEFAULT_CURRENCY;
  return new Intl.NumberFormat(CURRENCY_LOCALES[supportedCurrency], {
    style: 'currency',
    currency: supportedCurrency,
  }).formatToParts(0).find((part) => part.type === 'currency')?.value || supportedCurrency;
}

export function CurrencyProvider({ user, children }) {
  const [currency, setCurrency] = useState(() => (
    CURRENCIES.some((option) => option.code === user?.currency) ? user.currency : DEFAULT_CURRENCY
  ));

  useEffect(() => {
    setCurrency(
      CURRENCIES.some((option) => option.code === user?.currency) ? user.currency : DEFAULT_CURRENCY
    );
  }, [user?.id, user?.currency]);

  const updateCurrency = async (nextCurrency) => {
    const response = await apiFetch('/api/settings/currency', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currency: nextCurrency }),
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || `Could not save currency preference (${response.status}).`);
    }

    setCurrency(data.currency);
  };

  const value = useMemo(() => ({
    currency,
    currencySymbol: getCurrencySymbol(currency),
    formatCurrency: (amount) => formatCurrency(amount, currency),
    updateCurrency,
  }), [currency]);

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export function useCurrency() {
  const context = useContext(CurrencyContext);
  if (!context) throw new Error('useCurrency must be used within a CurrencyProvider.');
  return context;
}
