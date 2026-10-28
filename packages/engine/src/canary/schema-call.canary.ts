// expect: no-restricted-syntax No zod schema calls
import { Rate } from '@fa/contracts';

export const ok = (s: string): boolean => Rate.safeParse(s).success;
