// Vitest setup file: property tests are reproducible run to run (ADR-011).
// A failure prints its seed and path; replay it with fc.assert(..., { seed, path }).
import fc from 'fast-check';

fc.configureGlobal({ seed: 20261027 });
