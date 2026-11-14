/*
 * AI Assistance Disclosure:
 * Tool: Codex (model: gpt-5.6-luna), date: 2026-09-28
 * Scope: Phase 0 Task 1 project scaffold configuration; no decisions made.
 * Author review: Congchen
 */
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
export default tseslint.config({ ignores: ['dist/', 'node_modules/'] }, js.configs.recommended, ...tseslint.configs.recommended, { rules: { '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }] } });
