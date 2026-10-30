import path from 'node:path';
import { defineConfig } from 'vitest/config';

const here = import.meta.dirname;

export default defineConfig({
  test: {
    environment: 'node',
    fileParallelism: false,
    globalSetup: ['tests/global-setup.ts'],
    setupFiles: ['tests/setup-env.ts'],
    //First run pulls the Supabase image before anything can connect.
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
  resolve: {
    alias: {
      '@': path.resolve(here, 'src'),
      '@database': path.resolve(here, 'src/database'),
      '@data': path.resolve(here, 'src/data'),
      '@api': path.resolve(here, 'src/api'),
      '@middleware': path.resolve(here, 'src/middleware'),
    },
  },
});
