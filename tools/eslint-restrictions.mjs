// Restrictions used by eslint.config.mjs: import boundaries (ADR-002, 004, 005, 009),
// forbidden syntax and properties (ADR-003, 004, 011, 013). Spec §7.2.

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
export const ZUSTAND_BAN = {
  group: ['zustand', 'zustand/*'],
  message: 'Zustand only for the profile store in entities/profile/model (ADR-009).',
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
  shared: [
    UPWARD(['entities', 'features', 'widgets', 'app']),
    ENGINE_BAN,
    FIXTURES_BAN,
    ZUSTAND_BAN,
  ],
  entities: [
    UPWARD(['features', 'widgets', 'app']),
    SAME_LAYER('entities'),
    FIXTURES_BAN,
    ZUSTAND_BAN,
  ],
  features: [
    UPWARD(['widgets', 'app']),
    SAME_LAYER('features'),
    QUERIES_BAN,
    FIXTURES_BAN,
    ZUSTAND_BAN,
  ],
  widgets: [UPWARD(['app']), SAME_LAYER('widgets'), FIXTURES_BAN, ZUSTAND_BAN],
  app: [FIXTURES_BAN, ZUSTAND_BAN],
};
export const restrict = (layer, { paths = BASE_PATHS, patterns = LAYER_PATTERNS[layer] } = {}) => [
  'error',
  { paths, patterns: [DEEP_IMPORTS, ...patterns] },
];

/* ---------- syntax and properties ---------- */
export const SYNTAX_COMMON = [
  { selector: 'TSEnumDeclaration', message: 'Use union types instead of enum.' },
  {
    selector: 'TSAsExpression[typeAnnotation.typeName.name=/^(Cents|Rate)$/]',
    message: 'Cents and Rate are created only by @fa/contracts functions and schemas (ADR-013).',
  },
  { selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']", message: 'Forbidden (XSS).' },
];
export const NO_AMBIENT_TIME = {
  selector: "NewExpression[callee.name='Date'][arguments.length=0]",
  message: 'Time only via shared/lib/clock or an asOf parameter (ADR-011).',
};
// ADR-013: no float on money; Number.isSafeInteger and other static Number methods stay allowed.
export const MONEY_FLOAT = [
  {
    selector: "CallExpression[callee.name='Number']",
    message: 'Number() is forbidden: use @fa/contracts parsers.',
  },
  {
    selector: 'CallExpression[callee.name=/^parse(Float|Int)$/]',
    message: 'parseFloat/parseInt are forbidden: use @fa/contracts or decimal.js.',
  },
  {
    selector:
      "CallExpression[callee.object.name='Number'][callee.property.name=/^parse(Float|Int)$/]",
    message: 'parseFloat/parseInt are forbidden: use @fa/contracts or decimal.js.',
  },
];
const NO_LOCAL_MONEY_FORMAT = {
  selector: "MemberExpression[object.name='Intl'][property.name='NumberFormat']",
  message: 'Money and rates are formatted only by @fa/contracts (ADR-013).',
};
export const AMBIENT_NOW = {
  object: 'Date',
  property: 'now',
  message: 'Time only via shared/lib/clock.',
};
export const WEB_PROPS = [
  {
    property: 'toFixed',
    message: 'Money and rates are formatted only by @fa/contracts (ADR-013).',
  },
  {
    property: 'toLocaleString',
    message: 'Money and rates are formatted only by @fa/contracts (ADR-013).',
  },
  {
    object: 'navigator',
    property: 'sendBeacon',
    message: 'Forbidden: user data is never sent (ADR-004).',
  },
  { object: 'document', property: 'cookie', message: 'Forbidden.' },
  AMBIENT_NOW,
];
export const WEB_SYNTAX = [...SYNTAX_COMMON, NO_AMBIENT_TIME, NO_LOCAL_MONEY_FORMAT];
export const NETWORK_GLOBALS = [
  { name: 'fetch', message: 'fetch only in shared/api/http.ts.' },
  { name: 'XMLHttpRequest', message: 'Network only via shared/api/http.ts.' },
];
