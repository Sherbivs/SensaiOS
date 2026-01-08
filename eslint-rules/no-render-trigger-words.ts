/**
 * ESLint Rule: no-render-trigger-words
 * 
 * Prevents usage of words that trigger Render's red log highlighting
 * in console output, log messages, and status strings.
 * 
 * @module eslint-rules/no-render-trigger-words
 * @since 2026-01-08
 * 
 * ## Problem
 * Render's log viewer highlights lines containing "error", "warn", etc.
 * in red, even for success messages like "0 errors found".
 * 
 * ## Solution
 * This ESLint rule warns when trigger words appear in:
 * - String literals passed to console.log/warn/error
 * - String literals passed to formatStatus(), printError(), etc.
 * - Template literals with trigger words
 * 
 * ## Configuration
 * Add to eslint.config.js:
 * ```javascript
 * import noRenderTriggerWords from './eslint-rules/no-render-trigger-words.js';
 * 
 * export default [
 *   {
 *     plugins: {
 *       'render-safe': { rules: { 'no-trigger-words': noRenderTriggerWords } }
 *     },
 *     rules: {
 *       'render-safe/no-trigger-words': 'warn'
 *     }
 *   }
 * ];
 * ```
 */

import { ESLintUtils } from '@typescript-eslint/utils';
import type { TSESTree } from '@typescript-eslint/types';

// ============================================================================
// Constants
// ============================================================================

/**
 * Words that trigger Render's red highlighting.
 * Each entry includes the trigger word and its suggested replacement.
 */
const TRIGGER_WORDS: Array<{ pattern: RegExp; word: string; suggestion: string }> = [
  { pattern: /\berror\b/i, word: 'error', suggestion: 'issue' },
  { pattern: /\berrors\b/i, word: 'errors', suggestion: 'issues' },
  { pattern: /\bwarning\b/i, word: 'warning', suggestion: 'note' },
  { pattern: /\bwarnings\b/i, word: 'warnings', suggestion: 'notes' },
  { pattern: /\bwarn\b/i, word: 'warn', suggestion: 'note' },
  { pattern: /\bFATAL\b/, word: 'FATAL', suggestion: '[HALT]' },
  { pattern: /\bfatal\b/, word: 'fatal', suggestion: 'halt' },
  { pattern: /\bCRITICAL\b/, word: 'CRITICAL', suggestion: '[STOP]' },
  { pattern: /\bfailed\b/i, word: 'failed', suggestion: 'stopped' },
  { pattern: /\bfail\b/i, word: 'fail', suggestion: 'stop' },
  { pattern: /\bfailure\b/i, word: 'failure', suggestion: 'stoppage' },
];

/**
 * Function names that output to console and should be checked.
 */
const OUTPUT_FUNCTIONS = new Set([
  // Console methods
  'console.log',
  'console.warn',
  'console.error',
  'console.info',
  
  // Output library functions
  'formatStatus',
  'printError',
  'printWarning',
  'printSuccess',
  'printInfo',
  
  // Process write
  'process.stdout.write',
  'process.stderr.write',
]);

/**
 * Contexts where trigger words are acceptable (don't warn).
 */
const ALLOWED_CONTEXTS = [
  // Error handling code
  /catch\s*\(/,
  /throw\s+new/,
  /Error\s*\(/,
  // Type annotations
  /:\s*Error/,
  // Property access on error objects
  /\.error\b/,
  /\.message\b/,
];

// ============================================================================
// Rule Implementation
// ============================================================================

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/Sherbivs/SensaiOS/blob/main/eslint-rules/${name}.md`
);

const rule = createRule({
  name: 'no-render-trigger-words',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Disallow words that trigger Render log highlighting in output strings',
    },
    messages: {
      triggerWord: 'Avoid "{{word}}" in output strings - triggers Render red highlighting. Use "{{suggestion}}" instead.',
    },
    schema: [
      {
        type: 'object',
        properties: {
          allowInTests: {
            type: 'boolean',
            description: 'Allow trigger words in test files',
          },
          customTriggers: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                word: { type: 'string' },
                suggestion: { type: 'string' },
              },
              required: ['word', 'suggestion'],
            },
            description: 'Additional trigger words to check',
          },
        },
        additionalProperties: false,
      },
    ],
    hasSuggestions: true,
  },
  defaultOptions: [{ allowInTests: true, customTriggers: [] }],
  
  create(context, [options]) {
    const filename = context.filename ?? context.getFilename();
    
    // Skip test files if allowInTests is true
    if (options.allowInTests && /\.(test|spec)\.[jt]sx?$/.test(filename)) {
      return {};
    }
    
    /**
     * Check if a string contains trigger words and report if found.
     */
    function checkString(node: TSESTree.Literal | TSESTree.TemplateElement, value: string) {
      // Skip if in allowed context
      const sourceCode = context.sourceCode ?? context.getSourceCode();
      const text = sourceCode.getText(node.parent as TSESTree.Node);
      if (ALLOWED_CONTEXTS.some(pattern => pattern.test(text))) {
        return;
      }
      
      for (const trigger of TRIGGER_WORDS) {
        if (trigger.pattern.test(value)) {
          context.report({
            node: node as TSESTree.Node,
            messageId: 'triggerWord',
            data: {
              word: trigger.word,
              suggestion: trigger.suggestion,
            },
          });
          return; // Report once per string
        }
      }
    }
    
    /**
     * Check if node is inside an output function call.
     */
    function isInOutputContext(node: TSESTree.Node): boolean {
      let current: TSESTree.Node | undefined = node;
      
      while (current) {
        if (current.type === 'CallExpression') {
          const callee = current.callee;
          let calleeName = '';
          
          if (callee.type === 'Identifier') {
            calleeName = callee.name;
          } else if (callee.type === 'MemberExpression') {
            const obj = callee.object;
            const prop = callee.property;
            if (obj.type === 'Identifier' && prop.type === 'Identifier') {
              calleeName = `${obj.name}.${prop.name}`;
            }
          }
          
          if (OUTPUT_FUNCTIONS.has(calleeName)) {
            return true;
          }
        }
        current = current.parent;
      }
      
      return false;
    }
    
    return {
      // Check string literals
      Literal(node) {
        if (typeof node.value === 'string' && isInOutputContext(node)) {
          checkString(node, node.value);
        }
      },
      
      // Check template literal parts
      TemplateElement(node) {
        if (node.value.cooked && isInOutputContext(node)) {
          checkString(node, node.value.cooked);
        }
      },
    };
  },
});

export default rule;
