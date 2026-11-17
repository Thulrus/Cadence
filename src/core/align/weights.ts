/**
 * IDF-style anchor weights over the script (SPEC §6 last bullet).
 *
 * "Documents" for document frequency are fixed windows of `WEIGHT_CONFIG.windowTokens`
 * consecutive tokens. Fixed windows (rather than sentences) because match tokens carry no
 * punctuation, sentence length varies wildly between scripts, and ~20 tokens is about the
 * span the aligner searches over: a word that recurs in many such windows is a poor anchor
 * for telling one part of the script from another.
 *
 * weight = minWeight + (1 − minWeight) · (idfShare · idfNorm + lengthShare · lengthNorm)
 * with stopwords forced to `stopwordWeight` and 1–2 letter tokens to `shortWeight`.
 * Everything lands in roughly [0.1, 1].
 */

export const WEIGHT_CONFIG = {
  /** Tokens per pseudo-document for document frequency. */
  windowTokens: 20,
  /** Floor for ordinary (non-stopword, ≥3 letters) tokens. */
  minWeight: 0.25,
  /** Share of the variable part driven by rarity. */
  idfShare: 0.7,
  /** Share driven by token length (longer → more distinctive). */
  lengthShare: 0.3,
  /** Length at and below which lengthNorm is 0, and the length at which it saturates. */
  lengthFloor: 2,
  lengthCeil: 8,
  stopwordWeight: 0.1,
  shortWeight: 0.15,
  /** Tokens of at most this many letters get `shortWeight`. */
  shortMaxLength: 2,
  /** `isStrongAnchor` threshold. */
  strongAnchorWeight: 0.6,
} as const;

/** Function words that are never good anchors. */
export const STOPWORDS: ReadonlySet<string> = new Set(
  (
    'a an the and or but nor so yet of to in on at by for from with as into onto upon about ' +
    'than then that this these those there here is are was were be been being am do does did ' +
    'have has had will would shall should can could may might must not no it its i me my we ' +
    'us our you your he him his she her they them their what which who whom whose when where ' +
    'why how if just also very all any some such each every up out over too only own same ' +
    'other more most again oh well like'
  ).split(' '),
);

/** Weight per token, aligned with `tokens`. Deterministic; O(n). */
export function computeWeights(tokens: readonly string[], config = WEIGHT_CONFIG): number[] {
  const n = tokens.length;
  const docs = Math.max(1, Math.ceil(n / config.windowTokens));
  const df = new Map<string, number>();
  for (let d = 0; d < docs; d++) {
    const seen = new Set(tokens.slice(d * config.windowTokens, (d + 1) * config.windowTokens));
    for (const t of seen) df.set(t, (df.get(t) ?? 0) + 1);
  }
  const maxIdf = Math.log(docs + 1);
  return tokens.map((t) => {
    if (STOPWORDS.has(t)) return config.stopwordWeight;
    if (t.length <= config.shortMaxLength) return config.shortWeight;
    // Smoothed so a single-window script still ranks rare words above repeated ones.
    const idfNorm = Math.log((docs + 1) / df.get(t)!) / maxIdf;
    const span = config.lengthCeil - config.lengthFloor;
    const lengthNorm = Math.min(1, Math.max(0, (t.length - config.lengthFloor) / span));
    const v = config.idfShare * idfNorm + config.lengthShare * lengthNorm;
    return config.minWeight + (1 - config.minWeight) * v;
  });
}

/** True when a token is distinctive enough to anchor a match on its own (SPEC §7 step 4). */
export function isStrongAnchor(token: { weight: number }, config = WEIGHT_CONFIG): boolean {
  return token.weight >= config.strongAnchorWeight;
}
