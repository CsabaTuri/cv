// One lint run for the whole repository: the Node services, the test suite, the
// CI scripts and the Next.js site. `npm run lint` from the repository root.
//
// The site gets its own block because it needs the React/JSX/Next rules; the
// Node side only needs the JavaScript ones.

import js from '@eslint/js';
import nextPlugin from '@next/eslint-plugin-next';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import prettier from 'eslint-config-prettier/flat';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const nodeFiles = [
  'chat-backend/**/*.js',
  'deployer/**/*.js',
  'tests/**/*.mjs',
  '.github/scripts/**/*.mjs',
  '*.mjs',
  'cv/next.config.mjs',
  'cv/postcss.config.mjs',
];

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      'cv/out/**',
      'cv/.next/**',
      'cv/public/icons/**',
      'test-results/**',
      'playwright-report/**',
      'blob-report/**',
      'tree.txt',
    ],
  },

  // Node services, the test suite and the CI scripts.
  {
    files: nodeFiles,
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: globals.node,
    },
  },

  // The service worker runs in the browser, not in Node.
  {
    files: ['cv/public/sw.js'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'script',
      globals: { ...globals.browser, ...globals.serviceworker },
    },
  },

  // The site: TypeScript, JSX, React hooks, accessibility and the Next rules.
  {
    files: ['cv/src/**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
      jsxA11y.flatConfigs.recommended,
      reactHooks.configs.flat['recommended-latest'],
      nextPlugin.configs['core-web-vitals'],
    ],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    // The Next rules look for the pages/app directory relative to this setting;
    // without it they would resolve it against the repository root.
    settings: { next: { rootDir: 'cv' } },
    rules: {
      // Texts of the site come from the CMS, so raw apostrophes and quotes are
      // normal in the components and not worth an error.
      'react/no-unescaped-entities': 'off',
      // The export is static and the icons are already the right size, so the
      // next/image pipeline would only add markup without changing the bytes.
      '@next/next/no-img-element': 'off',
      // Client-only values (localStorage, the install prompt) and fetching the
      // stored copy on mount both need an effect, and this project exports
      // statically, so they cannot be read during render without breaking
      // hydration. The rule stays visible as a warning.
      'react-hooks/set-state-in-effect': 'warn',
    },
  },

  // The end-to-end specs run in Node, inside the Playwright test runner.
  {
    files: ['tests/e2e/**/*.ts'],
    extends: [...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: globals.node,
    },
  },

  // Last: switch off everything Prettier already decides.
  prettier,
);
