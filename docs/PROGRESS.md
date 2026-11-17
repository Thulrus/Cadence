# Progress & Handoff Log

Newest entry at the bottom. Each agent appends **one** entry when finishing (or blocking on) a chunk. Keep entries short (≤ ~15 lines) — the next agent reads this whole file. Record only what the next agents need: deviations from the brief, contract changes, gotchas, deferred items. Don't restate the brief.

Entry template:

```
## Chunk NN — <title> — DONE | BLOCKED (YYYY-MM-DD)
- Built: <one or two lines>
- Deviations / contract changes: <or "none">
- Gotchas for later chunks: <or "none">
- Deferred: <items pushed to a later chunk, with chunk #>
- Human check pending: <copied from brief, or "none">
```

---

## Chunk 00 — Project scaffold & plan — DONE (2026-11-17)

- Built: Vite 8 + TypeScript 7 + Vitest 5 + Prettier scaffold; `npm run check` (format, typecheck, test, build) passes. Contracts in `src/core/types.ts`, typed `Emitter` in `src/core/emitter.ts`. GitHub Actions workflow `.github/workflows/ci.yml` runs `check` on every push/PR and deploys `dist/` to Pages on `main` with `BASE_PATH=/<repo>/`.
- Deviations / contract changes: none.
- Gotchas: TypeScript 7 is the native (Go) compiler; `tsc` works as usual. `@types/node` is in `types` only so `vite.config.ts` can read `process.env` — don't use Node APIs in `src/`.
- Deferred: none.
- Human check pending: owner must create the GitHub repo `Cadence`, push `main`, and set **Settings → Pages → Source: GitHub Actions**. Agents do not push.

## Chunk 01 — App shell, view routing, settings store — DONE (2026-11-17)

- Built: `storage/settings.ts` (typed `SettingsStore`, per-field validation + clamping via `SETTINGS_LIMITS`, `migrate()` hook, `memoryStorage()` for tests); `ui/router.ts` (hash router, pure `parseRoute`/`routeHash`); placeholder views in `ui/views/`; `ui/appearance.ts` (settings → `data-theme`/`data-highlight` + `--prompt-*` CSS vars); `app.ts` composition root; four themes in `style.css`.
- Deviations / contract changes: `readingLinePct` lives in `appearance` (per brief), not `run`; ARCHITECTURE.md updated. `#/editor` with no id is a valid route (new script).
- Gotchas for later chunks: `update()` merges within a group and silently drops invalid values; `align` overrides can only be removed via `reset('align')`. Prompter CSS should consume `--prompt-*` vars (`--prompt-scale-x/y` for mirror/flip, `--prompt-spoken-opacity`, `--prompt-reading-line`). Dev console handle: `__cadence.settings` / `__cadence.router`.
- Deferred: none.
- Human check pending: `npm run dev`, click through the four nav links and use Back; run `__cadence.settings.update({ appearance: { theme: 'light' } })` (and `high-contrast`, `green-on-black`) and confirm colours change and persist across reload.
