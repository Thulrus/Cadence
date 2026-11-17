/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

// GitHub project pages serve from /<repo-name>/. CI sets BASE_PATH; local dev uses '/'.
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base,
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    environment: 'node',
  },
});
