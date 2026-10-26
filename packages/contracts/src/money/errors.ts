export type MoneyParseErrorCode = 'invalid_format' | 'too_many_decimals' | 'out_of_range';

export class MoneyParseError extends Error {
  constructor(
    readonly code: MoneyParseErrorCode,
    readonly input: string,
  ) {
    super(`${code}: ${JSON.stringify(input)}`);
    this.name = 'MoneyParseError';
  }
}
