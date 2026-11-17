# Cadence

A voice-following teleprompter that runs in the browser. It listens through the microphone, works out where you are in your script, and scrolls to keep up with you, so pauses, ad-libs, and skipped lines don't throw it off.

**▶ Open Cadence: <https://thulrus.github.io/Cadence/>**

Free and runs entirely in your browser: no account, no sign-up, no purchase, nothing to download. Just open the link. You can optionally install it as an app, and it then works offline.

> Status: in development. Voice following arrives in milestone M2; today the prompter follows taps and manual scrolling. See `SPEC.md` for the product spec and `docs/PLAN.md` for the build plan.

## Install

Installing is optional. Open <https://thulrus.github.io/Cadence/> in Chrome (Android tablet or desktop) and choose **Install app** (Android: menu → _Install app_ / _Add to Home screen_). After the first visit Cadence loads with no network at all. When a new version is published, a small **Update available** banner appears outside the prompter; nothing reloads until you tap **Reload**.

## Privacy

- **Your scripts stay on your device.** They are stored in the browser (IndexedDB, settings in localStorage). There is no server, account, analytics, or third-party request. Use **Export backup** to keep a copy.
- **Speech recognition:** voice following uses the browser's Web Speech API. On Chrome your microphone audio is sent to the browser vendor's (Google's) speech service to be transcribed, so it needs an internet connection; Cadence shows a one-time notice before the first start. Cadence itself never sends or stores audio. The optional mic level meter reads the microphone locally only. An on-device offline engine that keeps everything local is planned. Browsers without Web Speech (Firefox) get manual scrolling only.

## Writing scripts

Plain text works. A few optional markers are understood:

| You type              | Shown as                          | Spoken / matched? |
| --------------------- | --------------------------------- | ----------------- |
| `# Heading`           | larger heading (`##`… for levels) | no                |
| `[look up]`           | stage direction in a distinct hue | no                |
| blank line            | paragraph break                   | —                 |
| `*word*` / `**word**` | emphasis                          | yes               |

Load `.txt` / `.md` files with **Load file** or by dragging them onto the library or editor.

## Development

```sh
npm install
npm run dev      # dev server at http://localhost:5173 (secure context for the mic)
npm test         # unit tests (Vitest)
npm run check    # format check, typecheck, tests, build (what CI runs)
npm run format   # fix formatting
```

The service worker is only built for production. To try the PWA locally under the Pages subpath:

```sh
BASE_PATH=/Cadence/ npm run build
npx vite preview --base /Cadence/   # then open http://localhost:4173/Cadence/
```

Change dependencies with `npx npm@10 install …` so the lockfile matches CI's Node 22. App icons are rendered from `public/icon*.svg` by `scripts/gen-icons.sh` (needs Inkscape); the PNGs are committed.

## Deploy (GitHub Pages)

1. Create a GitHub repository named `Cadence` and push `main`.
2. In the repository, **Settings → Pages → Source: GitHub Actions**.
3. Every push to `main` runs `.github/workflows/ci.yml`: `npm run check` with `BASE_PATH=/<repo>/`, then deploys `dist/` to `https://<user>.github.io/Cadence/`.

## Manual device test checklist

_To be written in chunk 16._
