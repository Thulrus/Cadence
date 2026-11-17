# Chunk 16 — v1 hardening, samples, docs, acceptance pass

**Milestone:** M3 (ends v1) · **Depends on:** 15

## Goal

Close out v1 (M1–M3): sample scripts in-app, browser-specific messaging, accessibility and performance passes, complete README with the manual device checklist, and a walkthrough of SPEC §13 acceptance criteria.

## Read first

- SPEC §2, §11 last two bullets, §13
- `docs/PROGRESS.md` in full (look for deferred items and pending human checks)
- `README.md`

## Tasks

1. **Deferred items:** resolve or explicitly re-defer everything marked "Deferred" in PROGRESS.md for chunks ≤ 15.
2. **Samples in-app:** "Add sample scripts" action in the library (empty state and menu) that loads the three fixtures from chunk 11 (bundled as raw imports, no fetch at runtime needed).
3. **Browser messaging:** verify the capability messages for Chrome desktop/Android, Safari iOS/iPadOS, Firefox; voice controls disabled with an explanation where unsupported.
4. **Accessibility:** labels on all controls, focus order, visible focus rings, contrast in all four themes (≥ 7:1 for script text in high-contrast), `aria-live` for status changes (polite, not chatty).
5. **Performance:** with a 5,000-word script, verify DOM build time, per-event alignment + render time, memory steady over a simulated 20-minute replay (no listener/DOM leaks on navigating in/out of the prompter repeatedly). Fix hot spots. Record numbers in PROGRESS.md.
6. **Error robustness:** global error handler that shows a small non-blocking message instead of a blank screen; prompter keeps working in manual mode if the engine throws.
7. **README:** usage guide (import, markup, modes, controls/keys, clicker, tuning), privacy section, browser support table, the **manual device test checklist** (Android tablet in a reverberant room, desktop Chrome, iPad Safari) covering every SPEC §13 criterion.
8. **Acceptance walkthrough:** for each SPEC §13 criterion, state how it's verified (test name, or manual checklist item) in a short table in PROGRESS.md.

## Done when

- `npm run check` passes; harness thresholds still met.
- README complete; PROGRESS.md has the acceptance table and perf numbers.

## Human check (copy to PROGRESS.md)

- Run the full README manual checklist on the Android tablet at church (or a similar room) and desktop Chrome. Report failures as new work before starting M4.

## Out of scope

Offline ASR (17–18).
