/* ==========================================================================
   NUMBER BOX DIGIT LIMIT (2026-11-10)
   Cuts what is typed so a number box can never hold a too-long number
   (before, a price like 9999999999999999… could be typed). Extra digits are
   simply not accepted.

   limitDigits('123456', { whole: 4 })               → '1234'
   limitDigits('12.3456', { whole: 5, decimals: 2 })  → '12.34'
   limitDigits('-12.5', { whole: 4, decimals: 2, negative: true }) → '-12.5'
   ========================================================================== */
export function limitDigits(value, { whole = 4, decimals = 0, negative = false } = {}) {
  const text = String(value ?? '');
  const minus = negative && text.trim().startsWith('-') ? '-' : '';
  const cleaned = text.replace(decimals > 0 ? /[^\d.]/g : /[^\d]/g, '');
  const [rawWhole = '', ...rest] = cleaned.split('.');
  const wholePart = rawWhole.replace(/^0+(?=\d)/, '').slice(0, whole);
  const decimalPart = decimals > 0 && rest.length ? `.${rest.join('').slice(0, decimals)}` : '';
  return `${minus}${wholePart}${decimalPart}`;
}
