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
        global: 'readonly',
        window: 'readonly',
        document: 'readonly',
        HTMLElement: 'readonly',
        Element: 'readonly',
        navigator: 'readonly',
        setTimeout: 'readonly',
        fetch: 'readonly',
        MutationObserver: 'readonly',
        MutationRecord: 'readonly',
        performance: 'readonly',
        require: 'readonly'
      }
    },
    plugins: {
      '@typescript-eslint': tseslint
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { 'argsIgnorePattern': '^_' }],
      // Disabled: Epic 7 requires `any` for undocumented Obsidian internal APIs
      // (commands.executeCommandById, vault.adapter.basePath, workspace internals, etc.)
      '@typescript-eslint/no-explicit-any': 'off',
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
    files: ['src/commands/dreamweaving-commands.ts', 'src/services/submodule-manager-service.ts'],
    languageOptions: {
      globals: {
        require: 'readonly'
      }
    }
  },
  {
    ignores: [
      'main.js',
      'node_modules/',
      '*.d.ts',
      'src/features/realtime-transcription/scripts/venv/**',
      'src/features/github-sharing/viewer-bundle/**',
      'src/features/github-publishing/viewer-bundle/**',
      'dist/**'
    ]
  }
];