export type MoneyParseErrorCode = 'invalid_format' | 'too_many_decimals' | 'out_of_range';

export class MoneyParseError extends Error {
  readonly code: MoneyParseErrorCode;
  readonly input: string;
  constructor(code: MoneyParseErrorCode, input: string) {
    super(`${code}: ${JSON.stringify(input)}`);
    this.name = 'MoneyParseError';
    this.code = code;
    this.input = input;
  }
}
