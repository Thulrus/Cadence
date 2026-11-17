/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub project pages serve from /<repo-name>/. CI sets BASE_PATH; local dev uses '/'.
const base = process.env.BASE_PATH ?? '/';

/** Dark theme background (matches --bg in style.css). */
const THEME_COLOR = '#000000';

export default defineConfig({
  base,
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  plugins: [
    VitePWA({
      // Never reload on our own: the update banner applies the new SW only on user tap.
      registerType: 'prompt',
      injectRegister: false,
      manifest: {
        name: 'Cadence',
        short_name: 'Cadence',
        description: 'Voice-following teleprompter. Scripts stay on your device.',
        display: 'standalone',
        orientation: 'any',
        // Relative to the manifest URL, so they follow BASE_PATH.
        start_url: './',
        scope: './',
        theme_color: THEME_COLOR,
        background_color: THEME_COLOR,
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Full app shell. Source maps are not precached.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2,webmanifest}'],
        // Hash routing: every navigation is index.html.
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    environment: 'node',
  },
});
