// expect: no-restricted-syntax No zod schema calls
import { Cents } from '@fa/contracts';

export const c = Cents.parse(1);
