//  @ts-check

import { tanstackConfig } from '@tanstack/eslint-config'

export default [
  ...tanstackConfig,
  {
    rules: {
      'import/no-cycle': 'off',
      'import/order': 'off',
      'sort-imports': 'off',
      '@typescript-eslint/array-type': 'off',
      '@typescript-eslint/require-await': 'off',
      // This frontend uses npm without pnpm catalogs or workspace settings.
      'pnpm/json-enforce-catalog': 'off',
      'pnpm/json-valid-catalog': 'off',
      'pnpm/json-prefer-workspace-settings': 'off',
    },
  },
  {
    ignores: ['eslint.config.js', 'prettier.config.js'],
  },
]
