import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import importPlugin from 'eslint-plugin-import-x';
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
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
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
        node: {
          extensions: ['.js', '.ts', '.mjs', '.cjs'],
        },
      },
    },
  },
  // === RING SECURITY MODEL ENFORCEMENT (Sensai OS v1.1.2) ===
  // Ring 0 (Kernel): src/kernel/** — CANNOT import from any upper rings
  {
    files: ['src/kernel/**/*.ts'],
    plugins: { import: importPlugin },
    rules: {
      'import/no-restricted-paths': ['error', {
        zones: [
          {
            target: './src/kernel',
            from: './src/sensaios',
            message: '🚫 Ring 0 (Kernel) CANNOT import from Ring 1 (SensaiOS). Kernel is the substrate - it must have zero dependencies on upper rings.'
          },
          {
            target: './src/kernel',
            from: './src/app',
            message: '🚫 Ring 0 (Kernel) CANNOT import from Ring 3 (Apps). Kernel must remain app-agnostic.'
          },
          {
            target: './src/kernel',
            from: './src/observability',
            message: '🚫 Ring 0 (Kernel) CANNOT import from Ring 3 (Apps). Kernel must remain app-agnostic.'
          },
          {
            target: './src/kernel',
            from: './src/bot',
            message: '🚫 Ring 0 (Kernel) CANNOT import from Ring 3 (Apps). Kernel must remain app-agnostic.'
          },
          {
            target: './src/kernel',
            from: './src/core',
            message: '🚫 Ring 0 (Kernel) CANNOT import from Ring 3 (Apps). Kernel must remain app-agnostic.'
          },
          {
            target: './src/kernel',
            from: './src/services',
            message: '🚫 Ring 0 (Kernel) CANNOT import from Ring 3 (Apps). Keep kernel primitive and dependency-free.'
          }
        ]
      }]
    }
  },
  // Ring 1 (SensaiOS): src/sensaios/** — CANNOT import from Ring 3 (Apps)
  {
    files: ['src/sensaios/**/*.ts'],
    plugins: { import: importPlugin },
    rules: {
      'import/no-restricted-paths': ['error', {
        zones: [
          {
            target: './src/sensaios',
            from: './src/bot',
            message: '🚫 Ring 1 (SensaiOS) CANNOT import from Ring 3 (Apps/Bot). SensaiOS is the OS layer - apps sit above it.'
          },
          {
            target: './src/sensaios',
            from: './src/core',
            message: '🚫 Ring 1 (SensaiOS) CANNOT import from Ring 3 (Apps/Core). SensaiOS is the OS layer - apps sit above it.'
          },
          {
            target: './src/sensaios',
            from: './src/services',
            message: '🚫 Ring 1 (SensaiOS) CANNOT import from Ring 3 (Apps/Services). SensaiOS is the OS layer - apps sit above it.'
          },
          {
            target: './src/sensaios',
            from: './src/app',
            message: '🚫 Ring 1 (SensaiOS) CANNOT import from Ring 3 (Apps). SensaiOS is the OS layer - apps sit above it.'
          },
          {
            target: './src/sensaios',
            from: './src/observability',
            message: '🚫 Ring 1 (SensaiOS) CANNOT import from Ring 3 (Apps/Observability). SensaiOS is the OS layer - apps sit above it.'
          }
        ]
      }]
    }
  },
  // Ring 3 (Apps): src/bot/**, src/core/**, src/services/** — CANNOT import from Ring 0 (Kernel) or Ring 1 (SensaiOS) directly
  // Apps MUST use ComponentContext provided by SensaiOS, not raw kernel primitives
  {
    files: ['src/app/**/*.ts', 'src/observability/**/*.ts', 'src/bot/**/*.ts', 'src/core/**/*.ts', 'src/services/**/*.ts'],
    plugins: { import: importPlugin },
    rules: {
      'import/no-restricted-paths': ['error', {
        zones: [
          {
            target: './src/app',
            from: './src/kernel',
            message: '🚫 Ring 3 (Apps) MUST use ComponentContext from SensaiOS, not Ring 0 (Kernel) directly. Import via ComponentContext interface.'
          },
          {
            target: './src/app',
            from: './src/sensaios',
            message: '🚫 Ring 3 (Apps) MUST use ComponentContext interface, not Ring 1 (SensaiOS) internals directly. Use ctx.db, ctx.exports, etc.'
          },
          {
            target: './src/observability',
            from: './src/kernel',
            message: '🚫 Ring 3 (Apps) MUST use ComponentContext from SensaiOS, not Ring 0 (Kernel) directly. Import via ComponentContext interface.'
          },
          {
            target: './src/observability',
            from: './src/sensaios',
            message: '🚫 Ring 3 (Apps) MUST use ComponentContext interface, not Ring 1 (SensaiOS) internals directly. Use ctx.obs, ctx.exports, etc.'
          },
          {
            target: './src/bot',
            from: './src/kernel',
            message: '🚫 Ring 3 (Apps/Bot) MUST use ComponentContext from SensaiOS, not Ring 0 (Kernel) directly. Use ctx provided to handlers.'
          },
          {
            target: './src/bot',
            from: './src/sensaios',
            message: '🚫 Ring 3 (Apps/Bot) MUST use ComponentContext interface, not Ring 1 (SensaiOS) internals directly. Use ctx.db, ctx.exports, etc.'
          },
          {
            target: './src/core',
            from: './src/kernel',
            message: '🚫 Ring 3 (Apps/Core) MUST use ComponentContext from SensaiOS, not Ring 0 (Kernel) directly. Use ctx provided to handlers.'
          },
          {
            target: './src/core',
            from: './src/sensaios',
            message: '🚫 Ring 3 (Apps/Core) MUST use ComponentContext interface, not Ring 1 (SensaiOS) internals directly. Use ctx.db, ctx.exports, etc.'
          },
          {
            target: './src/services',
            from: './src/kernel',
            message: '🚫 Ring 3 (Apps/Services) MUST use ComponentContext from SensaiOS, not Ring 0 (Kernel) directly. Use ctx provided to handlers.'
          },
          {
            target: './src/services',
            from: './src/sensaios',
            message: '🚫 Ring 3 (Apps/Services) MUST use ComponentContext interface, not Ring 1 (SensaiOS) internals directly. Use ctx.db, ctx.exports, etc.'
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
    files: ['src/utils/logger.js', 'src/shared/log.ts', 'src/shared/logBuffer.ts', 'src/utils/output-formatter.ts', 'src/shared/logging/render-safe.ts', 'scripts/lib/render-safe.ts', 'scripts/lib/output.ts', 'src/sensaios/loader/module-hook.ts'],
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