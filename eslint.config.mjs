import eslint from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

export default [
  eslint.configs.recommended,
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module',
        ecmaFeatures: {
          jsx: true
        }
      },
      globals: {
        console: 'readonly',
        global: 'readonly'
      }
    },
    plugins: {
      '@typescript-eslint': tseslint
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { 'argsIgnorePattern': '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/explicit-function-return-type': 'off',
      'no-unused-vars': 'off' // Disable base rule as it can report incorrect errors
    }
  },
  {
    files: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'src/dev/*.tsx', 'src/mocks/*.ts'],
    languageOptions: {
      globals: {
        document: 'readonly',
        window: 'readonly',
        HTMLElement: 'readonly'
      }
    }
  },
  {
    ignores: ['main.js', 'node_modules/', '*.d.ts']
  }
];