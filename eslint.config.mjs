// ESLint for Lesson Studio, following the rules in code-dot-org's root .eslintrc.js.
// Formatting is left to Prettier (.prettierrc.json, code-dot-org's apps/.prettierrc.js options).
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

const codeOrgRules = {
  curly: ['error', 'all'],
  // `x == null` (null or undefined) is allowed, as in the Airbnb guide that
  // code.org's style guide names as its default.
  eqeqeq: ['error', 'always', {null: 'ignore'}],
  // A bare `catch {}` marks a failure that is deliberately ignored.
  'no-empty': ['error', {allowEmptyCatch: true}],
  'no-array-constructor': 'error',
  'no-console': 'off',
  'no-duplicate-imports': 'error',
  'no-eval': 'error',
  'no-implicit-globals': 'error',
  'no-object-constructor': 'error',
  'no-redeclare': ['error', {builtinGlobals: true}],
  'no-undef': 'error',
  'no-unused-vars': ['error', {args: 'none'}],
  'no-with': 'error',
};

export default [
  {ignores: ['build/', 'node_modules/', 'docs/']},
  js.configs.recommended,
  prettier,
  {
    files: ['**/*.{js,mjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {...globals.browser, ...globals.webextensions},
    },
    rules: codeOrgRules,
  },
  {
    // Run by Node: build scripts, the local preview and Notion servers, and tests.
    files: [
      'scripts/**',
      'engine/scripts/**',
      'test/**',
      'engine/test/**',
      'engine/server.mjs',
      'engine/notion-*.mjs',
    ],
    languageOptions: {globals: {...globals.node}},
  },
];
