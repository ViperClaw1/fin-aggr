import process from 'node:process';
import { URL, fileURLToPath } from 'node:url';

// Graph rules ESLint cannot express: cycles, slice isolation, package boundaries, privacy (spec §7.3).
const WEB = '^apps/web/src';
const CANARY = '\\.canary\\.tsx?$';
// node_modules is not excluded: that would drop every edge to an npm package and silence the
// npm rules (contracts-depend-on-zod-only, money-checks-without-zod). doNotFollow keeps the edge.
const BUILD_OUTPUT = [
  '(^|/)\\.next/',
  '(^|/)coverage/',
  '(^|/)playwright-report/',
  '(^|/)test-results/',
];

/** @type {import('dependency-cruiser').IConfiguration} */
export default {
  forbidden: [
    { name: 'no-circular', severity: 'error', from: {}, to: { circular: true } },

    // layers: downward only
    {
      name: 'layer-shared-is-lowest',
      severity: 'error',
      from: { path: `${WEB}/shared/` },
      to: { path: `${WEB}/(entities|features|widgets|app)/` },
    },
    {
      name: 'layer-entities-no-up',
      severity: 'error',
      from: { path: `${WEB}/entities/` },
      to: { path: `${WEB}/(features|widgets|app)/` },
    },
    {
      name: 'layer-features-no-up',
      severity: 'error',
      from: { path: `${WEB}/features/` },
      to: { path: `${WEB}/(widgets|app)/` },
    },
    {
      name: 'layer-widgets-no-up',
      severity: 'error',
      from: { path: `${WEB}/widgets/` },
      to: { path: `${WEB}/app/` },
    },

    // slices of one layer are isolated
    {
      name: 'no-cross-slice',
      severity: 'error',
      from: { path: `${WEB}/(entities|features|widgets)/([^/]+)/` },
      to: { path: `${WEB}/$1/[^/]+/`, pathNot: `${WEB}/$1/$2/` },
    },

    // pure packages
    {
      name: 'engine-is-pure',
      severity: 'error',
      from: { path: '^packages/engine/src' },
      to: {
        path: [
          '^apps/',
          '^packages/fixtures/',
          'node_modules/(react|react-dom|next|zustand|@tanstack)/',
        ],
      },
    },
    {
      name: 'contracts-depend-on-zod-only',
      severity: 'error',
      from: { path: '^packages/contracts/src', pathNot: '\\.test\\.' },
      to: {
        dependencyTypes: ['npm', 'npm-dev', 'npm-peer', 'npm-optional'],
        pathNot: 'node_modules/zod/',
      },
    },
    {
      // ADR-016 D3: parsing, formatting and brand checks stay zod-free at runtime, so client code
      // that uses them does not pull zod. `import type` of a schema's type is fine.
      name: 'money-checks-without-zod',
      severity: 'error',
      from: {
        path: '^packages/contracts/src/(checks|money/(checks|parse|format|compare|errors)|money/canary/no-zod-[a-z-]+\\.canary)\\.ts$',
      },
      to: {
        path: [
          'node_modules/zod/',
          '^packages/contracts/src/(primitives|money/(cents|rate))\\.ts$',
        ],
        dependencyTypesNot: ['type-only'],
      },
    },
    {
      name: 'profile-never-in-gateway-types',
      severity: 'error',
      from: { path: '^packages/contracts/src/(gateway|queries)' },
      to: { path: '^packages/contracts/src/profile' },
    },

    // data and privacy
    {
      name: 'fixtures-only-via-gateway',
      severity: 'error',
      from: {
        pathNot: [`${WEB}/shared/api/`, '\\.test\\.', '^apps/web/e2e/', '^packages/fixtures/'],
      },
      to: { path: '^packages/fixtures/' },
    },
    {
      name: 'ads-contract-isolated',
      severity: 'error',
      from: {
        pathNot: [
          `${WEB}/(widgets/sponsored-slot|entities/sponsored|shared/api)/`,
          '^packages/(contracts|fixtures)/',
          '\\.test\\.',
        ],
      },
      to: { path: '^packages/contracts/src/ads' },
    },
    {
      name: 'profile-stays-local',
      severity: 'error',
      from: {
        path: `${WEB}/(entities/profile|features/(edit-profile|compute-net-yield|plan-coverage|filter-products))/`,
      },
      to: { path: `${WEB}/shared/api/` },
    },

    {
      // shared links must not carry the profile: URL state is never filled from it (ADR-004)
      name: 'url-state-never-from-profile',
      severity: 'error',
      from: { path: `${WEB}/features/(filter-products|open-citation)/` },
      to: { path: `${WEB}/entities/profile/` },
    },

    // hygiene
    {
      name: 'prod-not-to-test',
      severity: 'error',
      from: { pathNot: '\\.(test|spec)\\.' },
      to: { path: '\\.(test|spec)\\.' },
    },
    {
      name: 'no-orphans',
      severity: 'error',
      from: {
        orphan: true,
        pathNot: [
          `${WEB}/app/`,
          '^packages/[^/]+/src/index\\.ts$', // package entry points are imported from outside
          '\\.d\\.ts$',
          '\\.config\\.',
          '\\.test\\.',
          '^apps/web/e2e/',
          CANARY,
        ],
      },
      to: {},
    },
  ],
  options: {
    // canaries are checked only by `pnpm depcruise:canaries` (DC_CANARIES=1)
    exclude: { path: [...BUILD_OUTPUT, ...(process.env.DC_CANARIES ? [] : [CANARY])] },
    doNotFollow: { path: 'node_modules' },
    // the root tsconfig has no paths; the web one resolves @/… (packages need no paths).
    // Absolute: a relative fileName makes depcruise resolve `extends` from the wrong directory.
    tsConfig: {
      fileName: fileURLToPath(new URL('apps/web/tsconfig.depcruise.json', import.meta.url)),
    },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
    },
  },
};
