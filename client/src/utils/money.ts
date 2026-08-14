/**
 * Money formatting for the whole client.
 *
 * The currency code is an editable system setting, so it is not a compile-time
 * constant. `SettingsProvider` pushes the loaded value in here once per session
 * and every call site keeps using the plain `formatMoney(value)` signature.
 */

const FALLBACK_CURRENCY = 'USD';

let activeCurrency = FALLBACK_CURRENCY;

export const setActiveCurrency = (code: string): void => {
  activeCurrency = code || FALLBACK_CURRENCY;
};

export const getActiveCurrency = (): string => activeCurrency;

/** Formats an amount in the hospital's configured currency. */
export const formatMoney = (value: number): string => {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: activeCurrency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    // An unrecognised currency code must never blank out an invoice.
    return `${activeCurrency} ${value.toFixed(2)}`;
  }
};
