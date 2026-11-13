import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // The tests import no CSS, and Tailwind's PostCSS plugin doesn't load here.
  css: { postcss: {} },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
      // Tests run outside Next's server bundle, where `server-only` throws.
      'server-only': fileURLToPath(
        new URL('./test/server-only.ts', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'node',
    include: ['**/*.test.ts'],
    exclude: ['node_modules/**', '.next/**'],
  },
});
