# Chunk 06 — PWA, offline shell, deploy, README

**Milestone:** M1 (ends milestone) · **Depends on:** 01–05

## Goal

Installable PWA that loads offline after first visit, deployed to GitHub Pages under `/Cadence/`. Initial README. After this chunk M1 is complete and deployable.

## Read first

- SPEC §3, §10, §13 first bullet
- `vite.config.ts`, `.github/workflows/ci.yml`, `index.html`

## Tasks

1. Add `vite-plugin-pwa` (v2 is compatible with Vite 8). `registerType: 'prompt'`. Precache the full app shell (JS, CSS, HTML, icons, any bundled fonts). Manifest: name "Cadence", short_name "Cadence", `display: standalone`, dark theme/background colours, `start_url`/`scope` relative so they work under `BASE_PATH`, orientation `any`.
2. **Icons**: design a simple original SVG icon (e.g. a stylized waveform/caret) and generate 192, 512, and maskable 512 PNGs plus an apple-touch-icon. Commit the generated PNGs; a one-off script (or `@vite-pwa/assets-generator` as a dev dependency) is fine.
3. **Update UX**: when a new service worker is waiting, show a small non-modal "Update available — reload" banner. **Never auto-reload while the prompter is running**; only apply on user tap.
4. Verify base path: `BASE_PATH=/Cadence/ npm run build && npx vite preview --base /Cadence/` loads, routes work, SW registers under the subpath, and with the network disabled (DevTools offline) a reload still works. Make sure IndexedDB scripts survive.
5. **README.md**: what it is, privacy statement (scripts stay on device; with Web Speech on Chrome, audio goes to the browser vendor's speech service; offline engine planned), script markup, dev commands, deploy instructions (create repo `Cadence`, push `main`, Settings → Pages → Source: GitHub Actions). Leave a "Manual device test checklist" heading for chunk 16.
6. Check the CI workflow still passes with the plugin (`npm run check` with `BASE_PATH` set).

## Done when

- `npm run check` passes with and without `BASE_PATH=/Cadence/`.
- Built `dist/` contains `manifest.webmanifest`, `sw.js`, icons; Lighthouse-style installability criteria met (manifest + SW + icons + HTTPS on Pages).

## Human check (copy to PROGRESS.md)

- Push to GitHub, confirm the Pages deploy succeeds, open on the Android tablet, "Install app", turn on airplane mode, relaunch: app and saved scripts load.

## Out of scope

Caching ASR models (18).
