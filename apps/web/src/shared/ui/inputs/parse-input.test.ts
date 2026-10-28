import { describe, expect, it } from 'vitest';
import { parseMoneyInput, parsePercentInput, tryParse } from './parse-input';

describe('parseMoneyInput', () => {
  it('reads grouped dollars as cents', () => {
    expect(parseMoneyInput('1,234.56', false)).toEqual({ ok: true, value: 123456 });
  });

  it('treats blank text as a cleared field', () => {
    expect(parseMoneyInput('  ', false)).toEqual({ ok: true, value: null });
  });

  it('reports a third decimal instead of rounding', () => {
    expect(parseMoneyInput('1.234', false)).toEqual({ ok: false, code: 'too_many_decimals' });
  });

  it('rejects a negative amount unless allowed', () => {
    expect(parseMoneyInput('-5', false)).toEqual({ ok: false, code: 'negative' });
    expect(parseMoneyInput('-5', true)).toEqual({ ok: true, value: -500 });
  });

  it('reports text that is not a number', () => {
    expect(parseMoneyInput('12abc', false)).toEqual({ ok: false, code: 'invalid_format' });
  });
});

describe('parsePercentInput', () => {
  it('reads a percent with or without the sign', () => {
    expect(parsePercentInput('4.35')).toEqual({ ok: true, value: '0.0435' });
    expect(parsePercentInput('4.35%')).toEqual({ ok: true, value: '0.0435' });
  });

  it('rejects a percent above 100', () => {
    expect(parsePercentInput('100.5')).toEqual({ ok: false, code: 'out_of_range' });
  });
});

describe('tryParse', () => {
  it('rethrows errors that are not MoneyParseError', () => {
    const broken = (): never => {
      throw new TypeError('bug');
    };
    expect(() => tryParse(broken, '1')).toThrow(TypeError);
  });
});
