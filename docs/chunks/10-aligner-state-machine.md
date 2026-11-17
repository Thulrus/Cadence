# Chunk 10 — Aligner state machine

**Milestone:** M2 · **Depends on:** 09

## Goal

The stateful `Aligner` that consumes `RecognitionEvent`s and decides when and where to move position: tail buffer, interim/final reconciliation, monotonic bias, backtracking, lost mode, ad-lib holding, large-jump signalling. Pure and deterministic with injected time.

## Read first

- SPEC §5.1 "Handle known quirks", §7 steps 5–10
- `src/core/align/score.ts`, `config.ts`, `src/core/types.ts`

## Tasks

1. **`src/core/align/aligner.ts`**: `class Aligner { constructor(index, config); setPosition(p) /* external resync from tap/keys/timed */; feed(event: RecognitionEvent): AlignResult | null; reset(); state }`.
   - **Utterance tracking / dedup:** recognizers send cumulative hypotheses for the current utterance, and Android Chrome may repeat or rewrite earlier words. Keep the tokens of the current utterance; on each event, normalize `words`, diff against the previous hypothesis (longest common prefix), and treat only the changed suffix as new. After `isFinal`, the next event starts a new utterance. Maintain a rolling tail of the last `tailMax` tokens across utterances. Skip scoring when the tail is unchanged since the last scored call (step 9 dedup).
   - **Forward moves:** best acceptable candidate with `q ≥ p` → `p = q + 1`.
   - **Monotonic bias (step 5):** backward moves only if `allowBacktrack` (config, default true) and score ≥ `backtrackThreshold` and tail ≥ `backtrackMinTail`. Interim results may never move backward otherwise. Final results are authoritative for reconciling, but still obey this rule.
   - **Lost mode (step 6):** track ms of _speech activity_ (time with incoming non-empty events) since the last accepted match. After `lostAfterMs`, widen the window in `lostWidenSteps` steps up to the whole script, requiring `lostTailMin` tokens and `lostThreshold`. Expose `state.lost`.
   - **Ad-libs (step 7):** nothing acceptable → hold. Make sure short weak matches during ad-libs don't creep `p` forward (test this specifically).
   - **Large jumps (step 8):** result includes `{ position, previous, jumped: |Δ| > largeJumpTokens, lost, score }` so the UI can offer undo.
2. Config resolution from `Settings.align` overrides via `resolveConfig`. Add `allowBacktrack` to `ALIGN_DEFAULTS`.
3. Tests driving a scripted event sequence with a fake clock: clean read-through tracks exactly; cumulative interim events with rewrites; repeated interim fragments don't double-advance; ad-lib sentence then resume; skip one paragraph forward → caught by window or lost mode; reread previous sentence → backtrack only when confident; noise interim never moves backward; external `setPosition` re-centres the window.

## Done when

- `npm run check` passes; tests above pass deterministically.
- Public API documented in the module header (how to feed it, what results mean).

## Out of scope

Realistic noise simulation and accuracy metrics (11). Any UI (12).
