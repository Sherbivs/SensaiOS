import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import importPlugin from 'eslint-plugin-import';
import nodePlugin from 'eslint-plugin-n';
import promisePlugin from 'eslint-plugin-promise';
import prettierConfig from 'eslint-config-prettier';
import globals from 'globals';

export default [
  // Ignore Prisma generated files
  {
    ignores: ['src/generated/**'],
  },
  js.configs.recommended,
  {
    files: ['**/*.ts', '**/*.js'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        sourceType: 'module',
        ecmaVersion: 2022,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        ...globals.node,
        ...globals.es2022,
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      import: importPlugin,
      n: nodePlugin,
      promise: promisePlugin,
    },
    rules: {
      // Base ESLint rules
      'no-unused-vars': 'off', // Turn off base rule to use TypeScript version
      'no-empty': 'warn',
      'no-undef': 'off', // TypeScript handles this
      
      // Console usage prevention (optimization initiative)
      'no-console': 'error', // No console.* allowed - use log() API from logger.js
      
      // TypeScript ESLint rules
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-require-imports': 'warn',
      
      // Import rules (disabled - TypeScript handles module resolution)
      'import/order': 'off',
      'import/no-unresolved': 'off',
      
      // Node.js rules
      'n/no-missing-import': 'off', // TypeScript handles this
      'n/no-missing-require': 'off', // TypeScript handles this
      
      // 3-Layer Architecture Boundary Rules (disabled by default for gradual adoption)
      'import/no-restricted-paths': 'off',
    },
    settings: {
      'import/resolver': {
        typescript: {
          project: ['tsconfig.json', 'tsconfig.build.json'],
          alwaysTryTypes: true
        },
        node: {
          extensions: ['.js', '.ts', '.mjs', '.cjs'],
        },
      },
    },
  },
  // === 3-LAYER ARCHITECTURE ENFORCEMENT (OS Architect Recommendation) ===
  // Kernel Layer: CANNOT import from SensaiOS or Application layers
  {
    files: ['src/kernel/**/*.ts'],
    plugins: { import: importPlugin },
    rules: {
      'import/no-restricted-paths': ['error', {
        zones: [
          {
            target: './src/kernel',
            from: './src/sensaios',
            message: '🚫 Kernel CANNOT import from SensaiOS layer. Kernel is the substrate - it must have zero dependencies on upper layers.'
          },
          {
            target: './src/kernel',
            from: './src/app',
            message: '🚫 Kernel CANNOT import from Application layer. Kernel must remain app-agnostic.'
          },
          {
            target: './src/kernel',
            from: './src/observability',
            message: '🚫 Kernel CANNOT import from Observability layer. Observability must not block correctness.'
          },
          {
            target: './src/kernel',
            from: './src/bot',
            message: '🚫 Kernel CANNOT import from Bot layer. Kernel must remain app-agnostic.'
          },
          {
            target: './src/kernel',
            from: './src/services',
            message: '🚫 Kernel CANNOT import from Services layer. Keep kernel primitive and dependency-free.'
          }
        ]
      }]
    }
  },
  // Application/User-space Layer: CANNOT import Kernel directly (must go through SensaiOS)
  {
    files: ['src/app/**/*.ts', 'src/observability/**/*.ts', 'src/bot/**/*.ts'],
    plugins: { import: importPlugin },
    rules: {
      'import/no-restricted-paths': ['error', {
        zones: [
          {
            target: './src/app',
            from: './src/kernel',
            message: '🚫 Application MUST use SensaiOS adapters, not Kernel directly. Import from @sensai/* instead.'
          },
          {
            target: './src/observability',
            from: './src/kernel',
            message: '🚫 Observability MUST use SensaiOS adapters, not Kernel directly. Import from @sensai/* instead.'
          },
          {
            target: './src/bot',
            from: './src/kernel',
            message: '🚫 Bot layer MUST use SensaiOS adapters, not Kernel directly. Use ComponentContext from SensaiOS.'
          }
        ]
      }]
    }
  },
  {
    files: ['tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-console': 'off', // Allow console in tests for debugging
    },
  },
  {
    files: ['src/utils/logger.js', 'src/shared/log.ts', 'src/shared/logBuffer.ts', 'src/utils/output-formatter.ts'],
    rules: {
      'no-console': 'off', // Logging infrastructure needs console access
    },
  },
  {
    files: ['scripts/**/*.ts', 'scripts/**/*.js', 'scripts/**/*.mjs'],
    rules: {
      'no-console': 'warn', // Scripts should use output-formatter, but warn instead of error for migration
    },
  },
  {
    files: ['src/bot/**/*.ts', 'src/services/**/*.ts', 'src/shared/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  // Apply prettier config to disable conflicting rules
  prettierConfig,
];