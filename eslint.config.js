const globals = require('globals');
const jsxUsesVars = require('./eslint/jsx-uses-vars.cjs');

/** @type {import('eslint').Linter.FlatConfig[]} */
module.exports = [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/storybook-static/**',
      '**/build/**',
      '**/coverage/**',
      '**/.expo/**',
      '**/.expo-shared/**'
    ]
  },
  {
    files: ['**/*.js', '**/*.jsx'],
    plugins: {
      local: jsxUsesVars
    },
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: {
          jsx: true
        }
      },
      globals: {
        ...globals.browser,
        ...globals.node
      }
    },
    rules: {
      // Prevent false positives for imports used only in JSX (e.g. <Button />).
      'local/jsx-uses-vars': 'error',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-undef': 'error'
    }
  },
  {
    // Jest globals for tests (test/expect/describe/etc.)
    files: ['**/*.test.js', '**/*.test.jsx'],
    languageOptions: {
      globals: {
        ...globals.jest
      }
    }
  }
];


