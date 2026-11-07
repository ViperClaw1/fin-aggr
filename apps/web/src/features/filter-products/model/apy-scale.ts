/** Slider index for a minimum APY of 0–6% in steps of 0.05. Geometry, not a rate. */

export const APY_STEPS = 120;

/** 90 → "4.50"; 0 → "0". */
export function apyIndexToPercentText(index: number): string {
  const clamped = Math.min(APY_STEPS, Math.max(0, Math.round(index)));
  const whole = Math.floor(clamped / 20);
  const hundredths = (clamped % 20) * 5;
  if (hundredths === 0) return String(whole);
  return `${String(whole)}.${String(hundredths).padStart(2, '0')}`;
}

/** "4.5" or "4.50" → index. Null when the text is not a percent in range. */
export function percentTextToApyIndex(text: string): number | null {
  const match = /^(\d{1,2})(?:\.(\d{1,2}))?$/.exec(text.trim());
  if (match === null) return null;
  const whole = Number(match[1]);
  const frac = Number((match[2] ?? '').padEnd(2, '0'));
  const hundredths = whole * 100 + frac;
  if (hundredths < 0 || hundredths > 600) return null;
  return Math.round(hundredths / 5);
}
