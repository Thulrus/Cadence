# Cadence

Voice-following teleprompter: static PWA (Vite + TypeScript, vanilla DOM), deployed to GitHub Pages. Listens via the mic, aligns recognized speech to the script, and scrolls to follow the speaker. Full product spec: `SPEC.md`.

## How work is organized

Development is split into sequential chunks, each done by a fresh agent. If you were asked to "do the next chunk" (or `/next-chunk`):

1. Open `docs/PLAN.md` and take the **first row whose status is `TODO`** (or `IN PROGRESS` if a previous agent stopped mid-chunk — check `git status`/`git log` to see what exists). Set it to `IN PROGRESS`.
2. Read, in this order and **nothing more unless you need it**: the chunk brief in `docs/chunks/`, `docs/PROGRESS.md`, `docs/ARCHITECTURE.md`, and only the `SPEC.md` sections the brief cites. Read existing source files only as you need to touch or call them. Conserve context.
3. Do the chunk's tasks. Stay inside its scope; if you find something that belongs to a later chunk, note it in PROGRESS.md instead of doing it. If something in an earlier chunk is broken, fix it minimally and note it.
4. Verify: `npm run check` must pass (format, typecheck, tests, build). Run `npm run format` to fix formatting.
5. Finish: set the chunk's row to `DONE` in `docs/PLAN.md`, append your entry to `docs/PROGRESS.md` (template at top of that file, keep it short), then commit everything on `main` with a message like `Chunk 04: Prompter display, scrolling, PositionController`. Do **not** push; the owner pushes.
6. If you can't finish (blocked on a decision, a real-device test, or a failing approach), set status `BLOCKED`, explain in PROGRESS.md, commit what's solid, and stop. Don't start the next chunk.

One chunk per agent. Don't start the next one.

## Commands

- `npm run dev`: dev server (Web Speech needs a secure context; `localhost` counts)
- `npm test` / `npm run test:watch`: Vitest
- `npm run check`: everything CI runs. Must pass before you commit.
- `npm run format`: Prettier write

## Non-negotiables

- `src/core/**` is pure: no DOM, no browser globals, injected time. That's where the aligner lives, and it must be deterministic and unit-tested.
- No backend, no analytics, no runtime network requests (the browser's own Web Speech traffic is the only exception, and it's disclosed to the user).
- Thresholds and tuning values are named constants in config objects, never inline magic numbers.
- Never let the display jitter backward because of noisy interim results (SPEC §7.5).
- Keep `main` deployable at every commit.
