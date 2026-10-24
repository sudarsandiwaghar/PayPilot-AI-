/**
 * ISO 4217 Currency and Minor Unit Utilities.
 *
 * Ensures proper minor-unit conversions without hardcoding a 100-divisor:
 * - 0 decimals: JPY, KRW, VND, CLP, ISK, etc. (divisor: 1)
 * - 3 decimals: BHD, IQD, JOD, KWD, OMR, TND (divisor: 1000)
 * - 2 decimals: USD, EUR, GBP, AUD, CAD, INR, etc. (divisor: 100)
 */

const ZERO_DECIMAL_CURRENCIES = new Set([
  'BIF',
  'CLP',
  'DJF',
  'GNF',
  'ISK',
  'JPY',
  'KMF',
  'KRW',
  'PYG',
  'RWF',
  'UGX',
  'VND',
  'VUV',
  'XAF',
  'XOF',
  'XPF',
])

const THREE_DECIMAL_CURRENCIES = new Set(['BHD', 'IQD', 'JOD', 'KWD', 'OMR', 'TND'])

/**
 * Returns the minor-unit exponent (number of decimal places) for a given currency code.
 */
export function getCurrencyDecimals(currencyCode?: string | null): number {
  const code = (currencyCode || 'USD').toUpperCase().trim()
  if (ZERO_DECIMAL_CURRENCIES.has(code)) return 0
  if (THREE_DECIMAL_CURRENCIES.has(code)) return 3
  return 2
}

/**
 * Converts an integer minor-unit amount to its major-unit float representation.
 */
export function minorToMajor(minorAmount: number, currencyCode = 'USD'): number {
  const decimals = getCurrencyDecimals(currencyCode)
  return minorAmount / Math.pow(10, decimals)
}

/**
 * Formats an integer minor-unit amount into a localized currency string.
 */
export function formatCurrency(
  minorAmount: number | null | undefined,
  currencyCode = 'USD'
): string {
  if (minorAmount === null || minorAmount === undefined || isNaN(minorAmount)) {
    return '—'
  }
  const cleanCode = (currencyCode || 'USD').toUpperCase().trim()
  const decimals = getCurrencyDecimals(cleanCode)
  const major = minorAmount / Math.pow(10, decimals)

  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: cleanCode,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(major)
  } catch {
    return `${cleanCode} ${major.toFixed(decimals)}`
  }
}
