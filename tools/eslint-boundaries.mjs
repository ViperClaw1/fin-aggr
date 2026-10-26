// Layer and slice import boundaries for no-restricted-imports (spec §7.2; ADR-002, 004, 005, 009).

const DEEP_IMPORTS = {
  group: ['@/entities/*/*', '!@/entities/*/queries', '@/features/*/*', '@/widgets/*/*'],
  message: 'Import a slice only through its public API (index.ts); entities also expose queries.',
};
const UPWARD = (layers) => ({
  group: layers.map((l) => `@/${l}/**`),
  message: 'Upward imports are forbidden: app → widgets → features → entities → shared.',
});
const SAME_LAYER = (layer) => ({
  group: [`@/${layer}/**`],
  message: `Slices of ${layer} do not import each other (use relative paths inside a slice). Compose in a higher layer.`,
});
const ENGINE_BAN = {
  group: ['@fa/engine', '@fa/engine/*'],
  message: 'shared does not depend on the engine.',
};
export const FIXTURES_BAN = {
  group: ['@fa/fixtures', '@fa/fixtures/*'],
  message: 'Fixtures are wired only in shared/api (mock gateway).',
};
const QUERIES_BAN = {
  group: ['@/entities/*/queries'],
  message: 'features receive data as arguments; queries only in widgets and app.',
};

export const GATEWAY = {
  name: '@/shared/api',
  importNames: ['getGateway'],
  message: 'getGateway() only in entities/*/api.',
};
export const PROFILE_WRITE = {
  name: '@/entities/profile',
  importNames: ['useProfileActions'],
  message: 'Only features/edit-profile writes the profile.',
};
const OUT_OF_STACK = [
  'axios',
  'redux',
  '@reduxjs/toolkit',
  'jotai',
  'recoil',
  'mobx',
  'moment',
  'lodash',
].map((name) => ({ name, message: 'Not in the approved stack (ADR-009).' }));
export const BASE_PATHS = [GATEWAY, PROFILE_WRITE, ...OUT_OF_STACK];

export const LAYER_PATTERNS = {
  shared: [UPWARD(['entities', 'features', 'widgets', 'app']), ENGINE_BAN, FIXTURES_BAN],
  entities: [UPWARD(['features', 'widgets', 'app']), SAME_LAYER('entities'), FIXTURES_BAN],
  features: [UPWARD(['widgets', 'app']), SAME_LAYER('features'), QUERIES_BAN, FIXTURES_BAN],
  widgets: [UPWARD(['app']), SAME_LAYER('widgets'), FIXTURES_BAN],
  app: [FIXTURES_BAN],
};
export const restrict = (layer, { paths = BASE_PATHS, patterns = LAYER_PATTERNS[layer] } = {}) => [
  'error',
  { paths, patterns: [DEEP_IMPORTS, ...patterns] },
];
