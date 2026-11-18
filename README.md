# Cadence

A voice-following teleprompter that runs in the browser. It listens through the microphone, works out where you are in your script, and scrolls to keep up with you, so pauses, ad-libs, and skipped lines don't throw it off.

**▶ Open Cadence: <https://thulrus.github.io/Cadence/>**

Free and runs entirely in your browser: no account, no sign-up, no purchase, nothing to download. Just open the link. You can optionally install it as an app, and it then works offline.

> Status: v1 plus on-device speech (voice following with an on-device recognizer or the browser's speech service, timed and manual modes). See `SPEC.md` for the product spec and `docs/PLAN.md` for the build plan.

## Install

Installing is optional. Open <https://thulrus.github.io/Cadence/> in Chrome (Android tablet or desktop) and choose **Install app** (Android: menu → _Install app_ / _Add to Home screen_). After the first visit Cadence loads with no network at all. When a new version is published, a small **Update available** banner appears outside the prompter; nothing reloads until you tap **Reload**.

## Using Cadence

### Get started

1. Open the **Library**. To try it right away, choose **Add sample scripts** (a church talk with scripture references, a conversational video script, and a report full of numbers).
2. Or choose **New script** and paste your text, use **Load file** (`.txt` / `.md`), or drag a file onto the library or editor.
3. Choose **Open** to start the prompter, pick a mode (**Voice**, **Timed**, **Manual**) in the top bar, and tap **Start**.

Scripts save automatically as you type. **Export backup** downloads every script as one `.json` file; **Import backup** merges one back in (newer copies win). **Export .txt** saves a single script.

### On-device speech (recommended)

Settings → Speech engine → **Download model** (one-time, about 29 MB, English). After that, voice following runs entirely on your device: audio never leaves it, it works with no internet (airplane mode is fine), and it typically follows within a fraction of a second. It listens specifically for the words in your script, which also makes it robust in echoey rooms. **Automatic** uses it whenever it's downloaded; without it Cadence uses the browser's speech service. You can switch engines mid-talk from **Aa** without losing your place. **Delete model** in the same place frees the space.

### Modes

| Mode   | What moves the text                                                                                      |
| ------ | -------------------------------------------------------------------------------------------------------- |
| Voice  | Your voice. Cadence listens, finds where you are, and keeps the current line on the reading line.        |
| Timed  | A steady speed in words per minute (set with **−/+** in the bar or in Settings → Run). Stops at the end. |
| Manual | Only you: tap, drag, scroll, keys, or a clicker.                                                         |

You can switch modes, pause, and resume at any point in a talk; the position is kept. In every mode:

- **Tap a word** to jump there (in Voice mode this also re-syncs listening instantly).
- **Drag or scroll** to look around. The highlight keeps following you, but the text stops scrolling until you tap **Resume following** (or tap a word).
- After a big automatic jump, a toast says **Jumped ahead N lines — Undo**.
- If Cadence can't place what it hears (long ad-lib, wrong script) it shows **Lost — tap a word to resync**, and picks up again by itself when you return to the script.

The status badge in the bar shows **Listening**, **Paused**, **Lost**, **Recognizer restarting** (normal: the browser's recognizer stops every so often and Cadence restarts it), or an error such as **No mic permission**. The timer at the bottom right shows elapsed time and, if you set a **Target time**, whether you're ahead or behind.

The top bar hides itself during a run (Settings → Run → Hide controls after). Tap near the top or bottom edge of the screen, move the mouse to the top, or press Esc to bring it back.

### Keyboard and presentation clicker

| Key                 | Action                    |
| ------------------- | ------------------------- |
| Space, `b`, `.`     | Start / pause / resume    |
| ↓ / → and ↑ / ←     | Next / previous line      |
| Page Down / Page Up | Next / previous paragraph |
| Home                | Back to the start         |
| `[` / `]`           | Smaller / larger text     |
| `f`                 | Fullscreen                |
| Esc                 | Show the controls         |

Most Bluetooth presentation clickers send Page Down / Page Up (next / previous paragraph) or the arrow keys (one line), and their "blank screen" button sends `b` or `.` (pause). Pair the clicker with the tablet or computer like a keyboard; no setup is needed in Cadence.

### Display

**Aa** in the prompter bar changes text size, theme (dark, light, high contrast, green on black), mirror and flip (for prompter glass), the reading-line height, and the target time, without losing your place. **Settings** has everything: font, line spacing, column width, margins, how dim already-spoken text is, word, line, or no highlight, run options, and the speech engine and language. **⛶** goes fullscreen, and the screen is kept awake while the prompter is open (where the browser allows it).

### Tuning

Settings → **Advanced** → **Show advanced** exposes every voice-alignment threshold (how far ahead it searches, how sure it must be before jumping, when it declares itself lost, and so on). Changes apply live, so you can adjust them during a rehearsal; **Reset tuning** goes back to the defaults. The defaults were tuned on simulated noisy speech and should rarely need changing.

## Privacy

- **Your scripts stay on your device.** They are stored in the browser (IndexedDB, settings in localStorage). There is no server, account, analytics, or third-party request. Use **Export backup** to keep a copy.
- **On-device speech (recommended):** with the on-device model downloaded, recognition runs in your browser on your device. **No audio or text leaves the device**, and no network is needed. The model is downloaded once from this site (not a third party) and stored in the browser's on-device storage.
- **Browser speech service:** without the model, voice following uses the browser's Web Speech API. On Chrome your microphone audio is sent to the browser vendor's (Google's) speech service to be transcribed, so it needs an internet connection; Cadence shows a one-time notice before the first start. Cadence itself never sends or stores audio. The optional mic level meter reads the microphone locally only.

## Writing scripts

Plain text works. A few optional markers are understood:

| You type              | Shown as                          | Spoken / matched? |
| --------------------- | --------------------------------- | ----------------- |
| `# Heading`           | larger heading (`##`… for levels) | no                |
| `[look up]`           | stage direction in a distinct hue | no                |
| `[ad-lib: story]`     | ad-lib marker (see below)         | no                |
| blank line            | paragraph break                   | —                 |
| `*word*` / `**word**` | emphasis                          | yes               |

**Planned ad-libs:** put `[ad-lib]` (or `[improvise]`, optionally with a note: `[ad-lib: the mission story]`) where you'll go off-script. When voice-follow reaches it, it holds there (the badge says **Ad-lib**, and the line after the marker is underlined) and ignores everything you say until you start that line. If you come back somewhere else, tap or scroll there. Avoid starting the story with the opening words of the line after the marker: that counts as resuming.

Load `.txt` / `.md` files with **Load file** or by dragging them onto the library or editor.

Numbers, dates, times, money, and scripture references can be written naturally ("1,500", "March 15", "4:30 p.m.", "$12", "Alma 37:6", "1 Nephi 3:7"): Cadence knows they're spoken as words. Contractions match either way ("don't" / "do not").

## Browser support

| Browser                          | On-device voice (after model download) | Browser speech service                                       | Timed / manual | Notes                                                                                                  |
| -------------------------------- | -------------------------------------- | ------------------------------------------------------------ | -------------- | ------------------------------------------------------------------------------------------------------ |
| Chrome on Android (tablet/phone) | Yes, offline                           | Yes (needs internet)                                         | Yes            | Primary target. With the browser service the mic level meter is off by default (it stops recognition). |
| Chrome / Edge on desktop         | Yes, offline                           | Yes (needs internet)                                         | Yes            | Primary target.                                                                                        |
| Firefox                          | Yes, offline                           | No (no speech recognition in Firefox)                        | Yes            | Without the model, Voice mode is hidden and a note explains why.                                       |
| Safari on iPad / iPhone          | Not tested                             | Best effort: may stop unexpectedly; not in a home-screen app | Yes            | Cadence shows a note. Use Timed mode if it's unreliable.                                               |

Voice following also needs a secure (`https://`) page, which GitHub Pages provides. Where voice isn't available, Settings → Speech engine says why.

## Development

```sh
npm install
npm run dev      # dev server at http://localhost:5173 (secure context for the mic)
npm test         # unit tests (Vitest)
npm run check    # format check, typecheck, tests, build (what CI runs)
npm run format   # fix formatting
npm run model    # build the on-device speech model into public/models/ (downloads ~41 MB once)
```

Without `npm run model` the app works, but **Download model** reports that this build has no model. CI runs it before deploying; see `docs/decisions/0001-offline-asr.md`.

The service worker is only built for production. To try the PWA locally under the Pages subpath:

```sh
BASE_PATH=/Cadence/ npm run build
npx vite preview --base /Cadence/   # then open http://localhost:4173/Cadence/
```

Change dependencies with `npx npm@10 install …` so the lockfile matches CI's Node 22. App icons are rendered from `public/icon*.svg` by `scripts/gen-icons.sh` (needs Inkscape); the PNGs are committed.

## Deploy (GitHub Pages)

1. Create a GitHub repository named `Cadence` and push `main`.
2. In the repository, **Settings → Pages → Source: GitHub Actions**.
3. Every push to `main` runs `.github/workflows/ci.yml`: `npm run model` (on-device speech model, cached), `npm run check` with `BASE_PATH=/<repo>/`, then deploys `dist/` to `https://<user>.github.io/Cadence/`.

## Manual device test checklist

Run before relying on a new version for a real talk. Each item names the SPEC §13 acceptance criterion it covers. Use the 1,500-word sample (**Sample: The Small and Simple Things**) unless noted. Tips: `?debug` in the URL (`…/Cadence/?debug#/`) shows an on-screen recognizer log; `?sim` swaps in the simulated recognizer.

### Android tablet (Chrome), built-in mic at arm's length, in a reverberant room (chapel or similar)

- [ ] **Install and offline** (§13: loads from Pages, installs, works offline). Open <https://thulrus.github.io/Cadence/>, Install app, open it from the home screen, turn on airplane mode, close and reopen: the library and scripts load. Turn the network back on for the voice items.
- [ ] **Natural reading** (§13: within about one phrase, no backward jitter). Voice mode, Start, accept the privacy notice and mic prompt. Read the whole sample at a natural speaking pace. The highlight stays within about a phrase of you and never visibly steps backward. Note the typical lag.
- [ ] **Ad-lib** (§13: re-syncs automatically). Mid-paragraph, say a sentence or two that isn't in the script, then continue reading. It picks up again without a tap (it may briefly show Lost).
- [ ] **Skip ahead** (§13: re-syncs within a few seconds). Skip a whole paragraph and keep reading. It catches up within a few seconds and shows "Jumped ahead N lines"; Undo returns.
- [ ] **Tap to resync** (§13: instant). Tap a word several paragraphs away and start reading from there: it follows immediately.
- [ ] **Mode changes mid-talk** (§13: one tap each). While reading: tap the run button to pause, then resume; switch to Timed (scrolls at the WPM), then Manual (stops), then back to Voice. Position is kept every time.
- [ ] **Silence and restarts.** Stop talking for about a minute, then continue. The badge may show "Recognizer restarting" but listening resumes on its own.
- [ ] **Screen stays awake** through a 15-minute voice run (don't touch the screen).
- [ ] **Clicker** (paired Bluetooth presentation remote): forward/back moves by paragraph or line; the blank-screen button pauses.
- [ ] **Display:** rotate portrait ↔ landscape mid-run (the current line stays on the reading line); change size/theme with **Aa** mid-run; ⛶ fullscreen; controls auto-hide during a run and come back with a tap near the top or bottom edge.
- [ ] **Mirror/flip** with real prompter glass, if available: scrolling and tap-to-word still land on the right word.
- [ ] **Mic permission denied** (site settings → block microphone, then Start): badge shows "No mic permission" and a notice explains how to allow it.
- [ ] **On-device, airplane mode** (M4). On Wi-Fi: Settings → Speech engine → Download model (watch the progress; Cancel works; it ends with "Downloaded"). Turn on airplane mode, close and reopen the app, open the 1,500-word sample, Voice, Start. Note how long until "Listening" (first time, then again after Pause/Start), the lag behind your voice, and whether it keeps up for 10+ minutes. Compare with the browser service. Repeat the Ad-lib and Skip items.
- [ ] **Engine switch mid-talk:** while reading on-device, **Aa** → Speech engine → Browser speech service (on Wi-Fi), then back. Position is kept and listening continues.

### Desktop Chrome (Linux/Windows/macOS) with a USB or built-in mic

- [ ] **Natural reading**, **Ad-lib**, **Skip ahead**, **Tap to resync**, **Mode changes mid-talk** and **Silence and restarts**, as above.
- [ ] **Keyboard:** Space pauses/resumes; arrows, Page Up/Down, Home, `[` `]`, `f`, Esc all work; typing in a settings field doesn't move the script.
- [ ] **Library:** New script, paste, reload (still there); Load file and drag-drop a `.txt`/`.md`; rename, duplicate, delete; Export backup, then Import backup into a fresh browser profile.
- [ ] **Install and offline:** install from the address bar, go offline (DevTools → Network → Offline), reload: the app loads. Publish a new version and check the **Update available** banner appears (not on the prompter) and Reload applies it.
- [ ] **Mic level meter** moves while you speak (Settings → Speech engine → Mic level meter: Auto).

### iPad Safari (best effort)

- [ ] The app loads and installs (Share → Add to Home Screen) and works offline.
- [ ] In Safari (not the home-screen app), Voice mode shows the "best effort" note; read a few paragraphs and note how long it keeps listening.
- [ ] Timed and Manual modes, tap-to-word, drag-scroll, **Aa** options and fullscreen work.
- [ ] In the home-screen app, if Voice is unavailable, the Voice mode is hidden and Settings explains why.

### Any browser

- [ ] Firefox: without the model, Voice mode is hidden, a note says why, and Timed/Manual work. After **Download model**, Voice works on-device.
- [ ] Automated checks pass: `npm run check` (CI runs the same on every push; §13: all unit and noise-harness tests pass in CI).
