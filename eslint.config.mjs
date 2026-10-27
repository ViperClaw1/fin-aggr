// ESLint 9 flat config (spec §7.2, ADR-002/004/005/009/011/013).
import process from 'node:process';
import { defineConfig, globalIgnores } from 'eslint/config';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import importX from 'eslint-plugin-import-x';
import nextPlugin from '@next/eslint-plugin-next';
import prettier from 'eslint-config-prettier';
import vitest from '@vitest/eslint-plugin';
import {
  AMBIENT_NOW,
  BASE_PATHS,
  FIXTURES_BAN,
  GATEWAY,
  LAYER_PATTERNS,
  MONEY_FLOAT,
  NETWORK_GLOBALS,
  NO_AMBIENT_TIME,
  PROFILE_WRITE,
  SYNTAX_COMMON,
  WEB_PROPS,
  WEB_SYNTAX,
  ZUSTAND_BAN,
  restrict,
} from './tools/eslint-restrictions.mjs';

const WEB = 'apps/web/src';
const CANARIES = ['**/*.canary.ts', '**/*.canary.tsx'];

export default defineConfig(
  globalIgnores([
    '**/dist/**',
    '**/.next/**',
    '**/coverage/**',
    '**/*.generated.*',
    '**/next-env.d.ts',
  ]),
  // canaries are linted only by `pnpm lint:canaries` (LINT_CANARIES=1)
  process.env.LINT_CANARIES ? [] : [globalIgnores(CANARIES)],

  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  prettier,

  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    plugins: { 'import-x': importX },
    rules: {
      eqeqeq: ['error', 'always'],
      'no-console': 'error',
      'no-eval': 'error',
      'no-var': 'error',
      'prefer-const': 'error',
      'no-nested-ternary': 'error',
      complexity: ['error', 12],
      'max-depth': ['error', 3],
      'max-params': ['error', 4],
      'max-lines': ['error', { max: 300, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['error', { max: 80, skipBlankLines: true, skipComments: true }],

      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': [
        'error',
        { allowDefaultCaseForExhaustiveSwitch: false, requireDefaultForNonUnion: true },
      ],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/ban-ts-comment': [
        'error',
        {
          'ts-expect-error': 'allow-with-description',
          'ts-ignore': true,
          'ts-nocheck': true,
          minimumDescriptionLength: 10,
        },
      ],
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-unnecessary-condition': 'error',
      '@typescript-eslint/only-throw-error': 'error',
      '@typescript-eslint/prefer-readonly': 'error',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],

      'import-x/no-duplicates': 'error',
      'import-x/no-self-import': 'error',
      'import-x/no-useless-path-segments': 'error',
      'import-x/no-default-export': 'error',
      'import-x/no-extraneous-dependencies': 'error',
    },
  },

  // plain JS (configs, tools) is not in any tsconfig
  { files: ['**/*.{js,mjs,cjs}'], extends: [tseslint.configs.disableTypeChecked] },

  /* ---------- apps/web: React, a11y, Next, network, storage ---------- */
  {
    files: [`${WEB}/**/*.{ts,tsx}`],
    extends: [nextPlugin.configs['core-web-vitals']],
    plugins: { react, 'react-hooks': reactHooks, 'jsx-a11y': jsxA11y },
    settings: { react: { version: 'detect' }, next: { rootDir: 'apps/web/' } },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      ...jsxA11y.flatConfigs.strict.rules,
      'react/jsx-key': 'error',
      'react/no-array-index-key': 'error',
      'react/no-danger': 'error',
      'react/jsx-no-target-blank': 'error',
      'react/jsx-no-leaked-render': ['error', { validStrategies: ['ternary'] }],
      'react/no-unstable-nested-components': 'error',
      'react/jsx-no-useless-fragment': 'error',
      'react/self-closing-comp': 'error',
      'react/hook-use-state': 'error',

      'no-restricted-globals': [
        'error',
        ...NETWORK_GLOBALS,
        { name: 'localStorage', message: 'Only entities/profile/model/persist.ts (ADR-004).' },
        { name: 'sessionStorage', message: 'Only entities/profile/model/persist.ts (ADR-004).' },
      ],
      'no-restricted-properties': ['error', ...WEB_PROPS],
      'no-restricted-syntax': ['error', ...WEB_SYNTAX],
    },
  },

  /* ---------- layer boundaries ---------- */
  ['shared', 'entities', 'features', 'widgets', 'app'].map((layer) => ({
    files: [`${WEB}/${layer}/**/*.{ts,tsx}`],
    rules: { 'no-restricted-imports': restrict(layer) },
  })),

  /* ---------- targeted exceptions (after the general blocks) ---------- */
  {
    files: [`${WEB}/shared/api/**/*.ts`], // the mock gateway wires fixtures
    rules: {
      'no-restricted-imports': restrict('shared', {
        paths: BASE_PATHS.filter((p) => p !== GATEWAY),
        patterns: LAYER_PATTERNS.shared.filter((p) => p !== FIXTURES_BAN),
      }),
    },
  },
  {
    files: [`${WEB}/entities/*/api/**/*.ts`], // the only place that calls getGateway()
    rules: {
      'no-restricted-imports': restrict('entities', {
        paths: BASE_PATHS.filter((p) => p !== GATEWAY),
      }),
    },
  },
  {
    files: [`${WEB}/entities/profile/model/**/*.ts`], // the only Zustand store (ADR-009)
    rules: {
      'no-restricted-imports': restrict('entities', {
        patterns: LAYER_PATTERNS.entities.filter((p) => p !== ZUSTAND_BAN),
      }),
    },
  },
  {
    files: [`${WEB}/features/edit-profile/**/*.{ts,tsx}`], // the only profile writer
    rules: {
      'no-restricted-imports': restrict('features', {
        paths: BASE_PATHS.filter((p) => p !== PROFILE_WRITE),
      }),
    },
  },
  { files: [`${WEB}/shared/api/http.ts`], rules: { 'no-restricted-globals': 'off' } },
  {
    files: [`${WEB}/entities/profile/model/persist.ts`],
    rules: { 'no-restricted-globals': ['error', ...NETWORK_GLOBALS] },
  },
  {
    files: [`${WEB}/shared/lib/clock.ts`],
    rules: {
      'no-restricted-properties': ['error', ...WEB_PROPS.filter((p) => p !== AMBIENT_NOW)],
      'no-restricted-syntax': ['error', ...WEB_SYNTAX.filter((s) => s !== NO_AMBIENT_TIME)],
    },
  },

  /* ---------- pure packages ---------- */
  {
    files: ['packages/engine/**/*.ts', 'packages/contracts/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react-dom', 'next', 'next/*', 'zustand', '@tanstack/*', '@/*'],
              message: 'engine and contracts are plain TypeScript without UI or app code.',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        ...[
          'window',
          'document',
          'localStorage',
          'sessionStorage',
          'fetch',
          'navigator',
          'XMLHttpRequest',
        ].map((name) => ({ name, message: 'No environment access in pure packages.' })),
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Randomness only via seed (ADR-011).' },
        { object: 'Date', property: 'now', message: 'Time arrives as asOf (ADR-011).' },
        { property: 'toFixed', message: 'Money is never formatted through float.' },
        { property: 'toNumber', message: 'Decimal is never turned into float (ADR-013).' },
      ],
      'no-restricted-syntax': ['error', ...SYNTAX_COMMON, NO_AMBIENT_TIME, ...MONEY_FLOAT],
      '@typescript-eslint/explicit-function-return-type': ['error', { allowExpressions: true }],
      '@typescript-eslint/strict-boolean-expressions': 'error',
      'no-param-reassign': ['error', { props: true }],
    },
  },
  {
    files: ['packages/contracts/src/money/**/*.ts'], // the only place allowed to brand Cents and Rate (ADR-013)
    rules: {
      'no-restricted-syntax': [
        'error',
        { selector: 'TSEnumDeclaration', message: 'Use union types instead of enum.' },
        NO_AMBIENT_TIME,
        ...MONEY_FLOAT,
      ],
    },
  },

  /* ---------- thin pages; default export only where Next requires it ---------- */
  {
    files: [`${WEB}/app/**/page.tsx`],
    rules: {
      'max-lines': ['error', { max: 80, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['error', { max: 60, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    files: [
      `${WEB}/app/**/{page,layout,loading,error,not-found,template,default}.tsx`,
      `${WEB}/app/**/{route,sitemap,robots}.ts`,
      '**/*.config.{js,mjs,cjs,ts}',
      '.dependency-cruiser.mjs',
    ],
    rules: { 'import-x/no-default-export': 'off' },
  },

  /* ---------- tests ---------- */
  {
    files: ['**/*.test.{ts,tsx}'],
    plugins: { vitest },
    rules: {
      ...vitest.configs.recommended.rules,
      'vitest/no-focused-tests': 'error',
      'vitest/no-disabled-tests': 'error',
      'vitest/expect-expect': 'error',
      'vitest/no-identical-title': 'error',
      'max-lines-per-function': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },

  // canaries are excluded from tsconfig (they import modules that do not exist), so no type info
  { files: CANARIES, extends: [tseslint.configs.disableTypeChecked] },
);
