// depcruise: contracts-depend-on-zod-only
// Any npm package other than zod in contracts runtime code. Before 2026-10-28 this went unnoticed:
// node_modules sat in `exclude`, so depcruise saw no npm edges at all (ADR-016).
import { expect } from 'vitest';

export const e = expect;
