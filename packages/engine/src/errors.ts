export type EngineErrorCode = 'invalid_rate' | 'invalid_input' | 'no_tier' | 'invalid_rule';

/** Every invalid input ends here: the engine never returns NaN, Infinity, or a clamped value. */
export class EngineError extends Error {
  constructor(
    readonly code: EngineErrorCode,
    message: string,
  ) {
    super(`${code}: ${message}`);
    this.name = 'EngineError';
  }
}
