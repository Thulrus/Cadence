import { Emitter } from '../core/emitter';

/** Persisted user settings. See docs/ARCHITECTURE.md "Settings". */

export const THEMES = ['dark', 'light', 'high-contrast', 'green-on-black'] as const;
export type Theme = (typeof THEMES)[number];

export const HIGHLIGHT_MODES = ['word', 'line'] as const;
export type HighlightMode = (typeof HIGHLIGHT_MODES)[number];

export const RUN_MODES = ['voice', 'timed', 'manual'] as const;
export type RunMode = (typeof RUN_MODES)[number];

export const ENGINE_CHOICES = ['auto', 'webspeech', 'offline'] as const;
export type EngineChoice = (typeof ENGINE_CHOICES)[number];

export interface AppearanceSettings {
  fontFamily: string;
  fontSizePx: number;
  lineHeight: number;
  /** Target characters per line (column width), 30–50. */
  columnChars: number;
  /** Horizontal margin on each side, percent of viewport width. */
  marginPct: number;
  theme: Theme;
  /** Opacity of already-spoken text, 0..1. */
  spokenDim: number;
  mirrorX: boolean;
  flipY: boolean;
  highlight: HighlightMode;
  /** Vertical reading-line position, percent from top. */
  readingLinePct: number;
}

export interface RunSettings {
  mode: RunMode;
  timedWpm: number;
  targetDurationSec: number | null;
}

export interface EngineSettings {
  choice: EngineChoice;
  lang: string;
  /** Show the mic level meter (a second capture stream; may conflict on some devices). */
  micMeter: boolean;
  /** The one-time Web Speech privacy notice was acknowledged. */
  privacyNoticeSeen: boolean;
}

export type AlignOverrides = Record<string, number | boolean>;

export interface Settings {
  version: typeof SETTINGS_VERSION;
  appearance: AppearanceSettings;
  run: RunSettings;
  engine: EngineSettings;
  align: AlignOverrides;
}

export type SettingsGroup = Exclude<keyof Settings, 'version'>;

export const SETTINGS_VERSION = 1;
export const SETTINGS_KEY = 'cadence.settings.v1';

/** Allowed numeric ranges; values outside are clamped. */
export const SETTINGS_LIMITS = {
  fontSizePx: { min: 16, max: 200 },
  lineHeight: { min: 1, max: 3 },
  columnChars: { min: 30, max: 50 },
  marginPct: { min: 0, max: 40 },
  spokenDim: { min: 0, max: 1 },
  readingLinePct: { min: 10, max: 90 },
  timedWpm: { min: 40, max: 400 },
  targetDurationSec: { min: 1, max: 24 * 60 * 60 },
} as const;

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({
  version: SETTINGS_VERSION,
  appearance: {
    fontFamily: 'system-ui, sans-serif',
    fontSizePx: 56,
    lineHeight: 1.4,
    columnChars: 36,
    marginPct: 5,
    theme: 'dark',
    spokenDim: 0.4,
    mirrorX: false,
    flipY: false,
    highlight: 'word',
    readingLinePct: 33,
  },
  run: { mode: 'voice', timedWpm: 150, targetDurationSec: null },
  engine: { choice: 'auto', lang: 'en-US', micMeter: true, privacyNoticeSeen: false },
  align: {},
} satisfies Settings);

/** Minimal storage interface (localStorage-compatible) so tests can inject an in-memory store. */
export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function memoryStorage(initial: Record<string, string> = {}): StorageAdapter {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
  };
}

export type SettingsPatch = { [G in SettingsGroup]?: Partial<Settings[G]> };

export interface SettingsEvents extends Record<string, unknown> {
  change: { settings: Settings; groups: SettingsGroup[] };
}

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);

function num(v: unknown, fallback: number, limit?: { min: number; max: number }): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  return limit ? Math.min(limit.max, Math.max(limit.min, v)) : v;
}
const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);
const str = (v: unknown, fallback: string) =>
  typeof v === 'string' && v.trim() !== '' ? v : fallback;
function oneOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

/** Validate an untrusted value field-by-field against `base`; invalid fields keep `base` values. */
function sanitizeAppearance(raw: unknown, base: AppearanceSettings): AppearanceSettings {
  const r = isRec(raw) ? raw : {};
  const L = SETTINGS_LIMITS;
  return {
    fontFamily: str(r.fontFamily, base.fontFamily),
    fontSizePx: num(r.fontSizePx, base.fontSizePx, L.fontSizePx),
    lineHeight: num(r.lineHeight, base.lineHeight, L.lineHeight),
    columnChars: num(r.columnChars, base.columnChars, L.columnChars),
    marginPct: num(r.marginPct, base.marginPct, L.marginPct),
    theme: oneOf(r.theme, THEMES, base.theme),
    spokenDim: num(r.spokenDim, base.spokenDim, L.spokenDim),
    mirrorX: bool(r.mirrorX, base.mirrorX),
    flipY: bool(r.flipY, base.flipY),
    highlight: oneOf(r.highlight, HIGHLIGHT_MODES, base.highlight),
    readingLinePct: num(r.readingLinePct, base.readingLinePct, L.readingLinePct),
  };
}

function sanitizeRun(raw: unknown, base: RunSettings): RunSettings {
  const r = isRec(raw) ? raw : {};
  let target = base.targetDurationSec;
  if (r.targetDurationSec === null) target = null;
  else if (typeof r.targetDurationSec === 'number' && Number.isFinite(r.targetDurationSec))
    target = num(r.targetDurationSec, 0, SETTINGS_LIMITS.targetDurationSec);
  return {
    mode: oneOf(r.mode, RUN_MODES, base.mode),
    timedWpm: num(r.timedWpm, base.timedWpm, SETTINGS_LIMITS.timedWpm),
    targetDurationSec: target,
  };
}

function sanitizeEngine(raw: unknown, base: EngineSettings): EngineSettings {
  const r = isRec(raw) ? raw : {};
  return {
    choice: oneOf(r.choice, ENGINE_CHOICES, base.choice),
    lang: str(r.lang, base.lang),
    micMeter: bool(r.micMeter, base.micMeter),
    privacyNoticeSeen: bool(r.privacyNoticeSeen, base.privacyNoticeSeen),
  };
}

function sanitizeAlign(raw: unknown, base: AlignOverrides): AlignOverrides {
  const out: AlignOverrides = { ...base };
  if (!isRec(raw)) return out;
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v))) out[k] = v;
  }
  return out;
}

/** Upgrade stored JSON from older versions to the current shape. Identity for v1. */
export function migrate(raw: unknown): unknown {
  if (!isRec(raw)) return {};
  // Future: if (raw.version === 1) { ...transform...; raw.version = 2 }
  return raw;
}

/** Build a complete, valid Settings from untrusted stored data, falling back per field. */
export function parseSettings(raw: unknown, base: Settings = cloneDefaults()): Settings {
  const r = migrate(raw) as Rec;
  return {
    version: SETTINGS_VERSION,
    appearance: sanitizeAppearance(r.appearance, base.appearance),
    run: sanitizeRun(r.run, base.run),
    engine: sanitizeEngine(r.engine, base.engine),
    align: sanitizeAlign(r.align, base.align),
  };
}

function cloneDefaults(): Settings {
  return structuredClone(DEFAULT_SETTINGS) as Settings;
}

/** Typed, persisted settings. Emits `change` after every update/reset. */
export class SettingsStore extends Emitter<SettingsEvents> {
  private settings: Settings;

  constructor(private readonly storage: StorageAdapter) {
    super();
    let stored: unknown = {};
    try {
      const text = storage.getItem(SETTINGS_KEY);
      if (text) stored = JSON.parse(text);
    } catch {
      stored = {};
    }
    this.settings = parseSettings(stored);
  }

  /** Current settings. Returns a copy; mutate via `update`. */
  get(): Settings {
    return structuredClone(this.settings);
  }

  /** Merge a partial patch, group by group. Invalid values are ignored. */
  update(patch: SettingsPatch): void {
    const groups = (Object.keys(patch) as SettingsGroup[]).filter((g) => g in DEFAULT_SETTINGS);
    if (groups.length === 0) return;
    const merged: Rec = {};
    for (const g of groups) merged[g] = { ...this.settings[g], ...patch[g] };
    this.settings = parseSettings(merged, this.settings);
    this.persistAndEmit(groups);
  }

  /** Reset one group, or everything when no group is given. */
  reset(group?: SettingsGroup): void {
    const defaults = cloneDefaults();
    if (group) {
      this.settings = { ...this.settings, [group]: defaults[group] };
      this.persistAndEmit([group]);
    } else {
      this.settings = defaults;
      this.persistAndEmit(['appearance', 'run', 'engine', 'align']);
    }
  }

  private persistAndEmit(groups: SettingsGroup[]): void {
    try {
      this.storage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
    } catch {
      // Storage full or unavailable (private mode): keep working in memory.
    }
    this.emit('change', { settings: this.get(), groups });
  }
}
