/**
 * format.js — number and time formatting.
 */

const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];

let numberMode = 'suffix'; // 'suffix' | 'scientific'

/** Choose between suffix (1.23M) and scientific (1.23e6) notation. */
export function setNumberMode(mode) {
  numberMode = mode === 'scientific' ? 'scientific' : 'suffix';
}

/** Show 3 significant digits for a mantissa in [1, 1000). */
function mantissa(m) {
  if (m >= 100) return m.toFixed(0);
  if (m >= 10) return m.toFixed(1);
  return m.toFixed(2);
}

function scientific(n) {
  const exp = Math.floor(Math.log10(n));
  let m = n / Math.pow(10, exp);
  // Guard against rounding (e.g. 9.999 -> 10.00)
  if (Number(m.toFixed(2)) >= 10) return `1.00e${exp + 1}`;
  return `${m.toFixed(2)}e${exp}`;
}

/**
 * Format a number with 2-3 significant digits.
 * Small values (< 1000) are shown plainly; whole numbers stay whole.
 */
export function formatNumber(n) {
  if (!Number.isFinite(n)) return n > 0 ? '∞' : n < 0 ? '-∞' : '0';
  if (n < 0) return '-' + formatNumber(-n);
  if (n < 1000) {
    if (Number.isInteger(n)) return String(n);
    return n >= 100 ? n.toFixed(0) : n >= 10 ? n.toFixed(1) : n.toFixed(2);
  }
  if (numberMode === 'scientific') return scientific(n);
  let tier = Math.floor(Math.log10(n) / 3);
  if (tier >= SUFFIXES.length) return scientific(n);
  let m = n / Math.pow(1000, tier);
  // Rounding can push 999.6K to "1000K"; roll over to the next suffix.
  if (Number(mantissa(m)) >= 1000) {
    tier += 1;
    if (tier >= SUFFIXES.length) return scientific(n);
    m = n / Math.pow(1000, tier);
  }
  return mantissa(m) + SUFFIXES[tier];
}

/** Money: "$1.23M". */
export const formatMoney = (n) => '$' + formatNumber(n);

/** Duration in seconds -> "2h 05m", "3m 07s", "12.5s". */
export function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  if (seconds < 10) return `${seconds.toFixed(seconds < 1 ? 2 : 1)}s`;
  const s = Math.floor(seconds);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (x) => String(x).padStart(2, '0');
  if (d > 0) return `${d}d ${pad(h)}h`;
  if (h > 0) return `${h}h ${pad(m)}m`;
  if (m > 0) return `${m}m ${pad(sec)}s`;
  return `${sec}s`;
}
