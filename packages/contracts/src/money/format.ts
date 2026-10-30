// Display formatting on integers and strings only (ADR-013).
import type { Cents } from './cents';
import { centsFromSafeInteger } from './parse';
import type { Rate, SignedRate } from './rate';

const groupThousands = (digits: string): string => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** 123456 → "$1,234.56"; -5 → "-$0.05". */
export function formatUsd(value: Cents): string {
  const negative = value < 0;
  const abs = negative ? -BigInt(value) : BigInt(value);
  const dollars = groupThousands((abs / 100n).toString());
  const cents = (abs % 100n).toString().padStart(2, '0');
  return `${negative ? '-' : ''}$${dollars}.${cents}`;
}

/** For display: "$5,000" for whole dollars, "$5,000.50" otherwise. Totals keep formatUsd. */
export function formatUsdShort(value: Cents): string {
  const text = formatUsd(value);
  return text.endsWith('.00') ? text.slice(0, -3) : text;
}

/** Unsigned decimal fraction string → percent text; the point moves two places right on the string. */
function percentText(fractionText: string): string {
  const [whole = '0', fraction = ''] = fractionText.split('.');
  const shifted = fraction.padEnd(2, '0');
  const intPart = (whole + shifted.slice(0, 2)).replace(/^0+(?=\d)/, '');
  const fracPart = shifted.slice(2).replace(/0+$/, '');
  return `${fracPart === '' ? intPart : `${intPart}.${fracPart}`}%`;
}

/** "0.0435" → "4.35%". Exact: the decimal point moves two places right on the string. */
export function formatRate(rate: Rate): string {
  return percentText(rate);
}

/**
 * For a column of rates: at least two decimals, so "5%" and "4.5%" line up with "4.42%". Pads,
 * never rounds: "0.027385" stays "2.7385%". Inputs keep formatRate (exact round trip).
 */
export function formatRateDisplay(rate: SignedRate | Rate): string {
  const text = formatSignedRate(rate);
  const [num = '', frac] = text.slice(0, -1).split('.');
  return `${num}.${(frac ?? '').padEnd(2, '0')}%`;
}

/**
 * "-0.0312" → "−3.12%" with U+2212 MINUS SIGN; "0.0312" → "3.12%". SignedRate has no "-0".
 * Accepts a Rate too, so UI that shows either kind has one formatter.
 */
export function formatSignedRate(rate: SignedRate | Rate): string {
  return rate.startsWith('-') ? `−${percentText(rate.slice(1))}` : percentText(rate);
}

/** One decimal, half-up, trailing ".0" dropped. `unit` is the size of 1.0 (1000 for millions). */
function oneDecimal(value: number, unit: number): string {
  const tenths = Math.floor((value * 10 + Math.floor(unit / 2)) / unit);
  const whole = Math.floor(tenths / 10);
  const frac = tenths % 10;
  return frac === 0 ? String(whole) : `${String(whole)}.${String(frac)}`;
}

/**
 * An integer count of thousands of US dollars: 1_200_000 → "$1.2B", 50_000 → "$50M".
 * Below $1M the exact dollar amount is shown. Not a Cents value (ADR-013).
 */
export function formatUsdFromThousands(thousands: number): string {
  if (!Number.isSafeInteger(thousands) || thousands < 0) {
    throw new Error(
      `formatUsdFromThousands expects a non-negative safe integer, got ${String(thousands)}`,
    );
  }
  if (thousands >= 1_000_000) return `$${oneDecimal(thousands, 1_000_000)}B`;
  if (thousands >= 1_000) {
    const text = oneDecimal(thousands, 1_000);
    // 999.95 million rounds to 1000.0 million, which is a billion
    return text === '1000' ? '$1B' : `$${text}M`;
  }
  return formatUsdShort(centsFromSafeInteger(thousands * 100_000));
}

/**
 * A display percent already in percent points (6.5 → "6.5%"). One decimal, half-up.
 * Bank metrics arrive as numbers, not as Rate (spec §4). A non-finite value is "n/a".
 */
export function formatPercentPoints(points: number): string {
  if (!Number.isFinite(points)) return 'n/a';
  const negative = points < 0;
  const tenths = Math.round(Math.abs(points) * 10);
  if (tenths === 0) return '0%';
  const whole = Math.floor(tenths / 10);
  const frac = tenths % 10;
  const body = frac === 0 ? String(whole) : `${String(whole)}.${String(frac)}`;
  return `${negative ? '−' : ''}${body}%`;
}

/** A share of 1 (0.6 → "60%"). Display only; the number is not money. */
export function formatShare(share: number): string {
  if (!Number.isFinite(share)) return 'n/a';
  return formatPercentPoints(share * 100);
}
