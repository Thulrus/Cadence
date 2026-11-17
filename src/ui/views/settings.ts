import { ALIGN_DEFAULTS, ALIGN_TUNING, resolveConfig } from '../../core/align/config';
import {
  ENGINE_CHOICES,
  RUN_MODES,
  TIMER_DISPLAYS,
  HIGHLIGHT_MODES,
  MIC_METER_MODES,
  SETTINGS_LIMITS,
  THEMES,
  type AppearanceSettings,
  type EngineChoice,
  type EngineSettings,
  type MicMeterMode,
  type HighlightMode,
  type RunMode,
  type RunSettings,
  type SettingsStore,
  type Theme,
  type TimerDisplay,
} from '../../storage/settings';
import { FONT_FAMILIES, THEME_LABELS } from '../appearance';
import { button, h } from '../components/dom';
import {
  choiceField,
  numberField,
  rangeField,
  selectField,
  toggleField,
  type Field,
} from '../components/fields';
import { navBar } from '../components/nav';
import type { View } from '../router';
import type { ViewDeps } from './deps';

const HIGHLIGHT_LABELS: Record<HighlightMode, string> = { word: 'Word', line: 'Line' };

/** Slider steps (UI only; storage limits live in SETTINGS_LIMITS). */
const STEPS = { fontSizePx: 1, lineHeight: 0.05, columnChars: 1, marginPct: 1, pct: 1 } as const;
const PCT = 100;

/** All appearance controls, bound to the settings store. */
export function appearanceFields(settings: SettingsStore): Field[] {
  const a = () => settings.get().appearance;
  const set = (patch: Partial<AppearanceSettings>) => settings.update({ appearance: patch });
  const L = SETTINGS_LIMITS;
  return [
    choiceField<Theme>({
      label: 'Theme',
      options: THEMES.map((t) => ({ value: t, label: THEME_LABELS[t] })),
      get: () => a().theme,
      set: (theme) => set({ theme }),
    }),
    selectField({
      label: 'Font',
      options: FONT_FAMILIES.map((f) => ({ value: f.stack, label: f.label })),
      get: () => a().fontFamily,
      set: (fontFamily) => set({ fontFamily }),
    }),
    rangeField({
      label: 'Font size',
      unit: 'px',
      ...L.fontSizePx,
      step: STEPS.fontSizePx,
      get: () => a().fontSizePx,
      set: (fontSizePx) => set({ fontSizePx }),
    }),
    rangeField({
      label: 'Line spacing',
      ...L.lineHeight,
      step: STEPS.lineHeight,
      get: () => a().lineHeight,
      set: (lineHeight) => set({ lineHeight }),
    }),
    rangeField({
      label: 'Column width',
      unit: 'characters',
      ...L.columnChars,
      step: STEPS.columnChars,
      hint: 'Narrower columns keep your eyes near the camera.',
      get: () => a().columnChars,
      set: (columnChars) => set({ columnChars }),
    }),
    rangeField({
      label: 'Side margins',
      unit: '% of width',
      ...L.marginPct,
      step: STEPS.marginPct,
      get: () => a().marginPct,
      set: (marginPct) => set({ marginPct }),
    }),
    rangeField({
      label: 'Already-spoken text brightness',
      unit: '%',
      min: L.spokenDim.min * PCT,
      max: L.spokenDim.max * PCT,
      step: STEPS.pct,
      hint: 'Lower dims words you have already read.',
      get: () => a().spokenDim,
      set: (spokenDim) => set({ spokenDim }),
      toUi: (v) => Math.round(v * PCT),
      fromUi: (v) => v / PCT,
    }),
    choiceField<HighlightMode>({
      label: 'Highlight',
      options: HIGHLIGHT_MODES.map((m) => ({ value: m, label: HIGHLIGHT_LABELS[m] })),
      get: () => a().highlight,
      set: (highlight) => set({ highlight }),
    }),
    rangeField({
      label: 'Reading line',
      unit: '% from top',
      ...L.readingLinePct,
      step: STEPS.pct,
      hint: 'Where the current line sits. Near the top keeps your eyes close to a camera above the screen. Measured as the reader sees it, so it stays correct when flipped for prompter glass.',
      get: () => a().readingLinePct,
      set: (readingLinePct) => set({ readingLinePct }),
    }),
    toggleField({
      label: 'Mirror horizontally',
      hint: 'For beam-splitter prompter glass.',
      get: () => a().mirrorX,
      set: (mirrorX) => set({ mirrorX }),
    }),
    toggleField({
      label: 'Flip vertically',
      get: () => a().flipY,
      set: (flipY) => set({ flipY }),
    }),
  ];
}

/** Recognition languages offered (the normalizer is English-only, so English variants). */
export const ENGINE_LANGS = [
  { value: 'en-US', label: 'English (US)' },
  { value: 'en-GB', label: 'English (UK)' },
  { value: 'en-CA', label: 'English (Canada)' },
  { value: 'en-AU', label: 'English (Australia)' },
  { value: 'en-NZ', label: 'English (New Zealand)' },
  { value: 'en-IE', label: 'English (Ireland)' },
  { value: 'en-IN', label: 'English (India)' },
  { value: 'en-ZA', label: 'English (South Africa)' },
] as const;

const MIC_METER_LABELS: Record<MicMeterMode, string> = {
  auto: 'Auto (off on Android)',
  on: 'On',
  off: 'Off',
};

const ENGINE_LABELS: Record<EngineChoice, string> = {
  auto: 'Automatic',
  webspeech: 'Browser speech service',
  offline: 'Offline (not available yet)',
};

/** Speech engine controls, bound to the settings store. */
export function engineFields(settings: SettingsStore): Field[] {
  const e = () => settings.get().engine;
  const set = (patch: Partial<EngineSettings>) => settings.update({ engine: patch });
  return [
    selectField({
      label: 'Speech engine',
      options: ENGINE_CHOICES.map((c) => ({ value: c, label: ENGINE_LABELS[c] })),
      get: () => e().choice,
      set: (choice) => set({ choice: choice as EngineChoice }),
    }),
    selectField({
      label: 'Language',
      options: ENGINE_LANGS,
      get: () => e().lang,
      set: (lang) => set({ lang }),
    }),
    choiceField<MicMeterMode>({
      label: 'Mic level meter',
      options: MIC_METER_MODES.map((m) => ({ value: m, label: MIC_METER_LABELS[m] })),
      get: () => e().micMeter,
      set: (micMeter) => set({ micMeter }),
    }),
  ];
}

export const RUN_MODE_LABELS: Record<RunMode, string> = {
  voice: 'Voice',
  timed: 'Timed',
  manual: 'Manual',
};

const TIMER_LABELS: Record<TimerDisplay, string> = {
  always: 'Always visible',
  'with-controls': 'With controls',
  off: 'Off',
};

const SEC_PER_MIN = 60;
const WPM_STEP = 5;

/** Target duration as a minutes box (blank = no target), bound to the settings store. */
export function targetField(settings: SettingsStore, label = 'Target duration'): Field {
  const L = SETTINGS_LIMITS.targetDurationSec;
  return numberField({
    label,
    unit: 'minutes',
    min: L.min / SEC_PER_MIN,
    max: L.max / SEC_PER_MIN,
    step: 0.5,
    optional: true,
    placeholder: 'none',
    hint: 'Shows “on pace / 1:20 behind” next to the timer. Leave blank for no target.',
    get: () => {
      const t = settings.get().run.targetDurationSec;
      return t === null ? null : t / SEC_PER_MIN;
    },
    set: (m) =>
      settings.update({
        run: { targetDurationSec: m === null ? null : Math.round(m * SEC_PER_MIN) },
      }),
  });
}

/** Run controls (mode, timed speed, target, auto-hide, timer), bound to the settings store. */
export function runFields(settings: SettingsStore): Field[] {
  const r = () => settings.get().run;
  const set = (patch: Partial<RunSettings>) => settings.update({ run: patch });
  const L = SETTINGS_LIMITS;
  return [
    choiceField<RunMode>({
      label: 'Mode',
      options: RUN_MODES.map((m) => ({ value: m, label: RUN_MODE_LABELS[m] })),
      get: () => r().mode,
      set: (mode) => set({ mode }),
    }),
    rangeField({
      label: 'Timed scroll speed',
      unit: 'words/min',
      ...L.timedWpm,
      step: WPM_STEP,
      get: () => r().timedWpm,
      set: (timedWpm) => set({ timedWpm }),
    }),
    targetField(settings),
    rangeField({
      label: 'Hide controls after',
      unit: 'seconds',
      ...L.autoHideSec,
      step: 1,
      hint: 'During a run, the controls fade out after this long; tap near the top or bottom edge (or press Esc) to bring them back. 0 = never hide.',
      get: () => r().autoHideSec,
      set: (autoHideSec) => set({ autoHideSec }),
    }),
    choiceField<TimerDisplay>({
      label: 'Run timer',
      options: TIMER_DISPLAYS.map((t) => ({ value: t, label: TIMER_LABELS[t] })),
      get: () => r().timer,
      set: (timer) => set({ timer }),
    }),
  ];
}

/** One field per aligner tunable (ALIGN_TUNING), writing sparse overrides to Settings.align. */
export function tuningFields(settings: SettingsStore): Field[] {
  const current = () => resolveConfig(settings.get().align) as unknown as Record<string, unknown>;
  return Object.entries(ALIGN_TUNING).map(([key, p]) => {
    const def = (ALIGN_DEFAULTS as unknown as Record<string, number | boolean>)[key]!;
    const hint = `${p.help} Default: ${typeof def === 'boolean' ? (def ? 'on' : 'off') : def}.`;
    const field =
      typeof def === 'boolean'
        ? toggleField({
            label: p.label,
            hint,
            get: () => current()[key] as boolean,
            set: (v) => settings.update({ align: { [key]: v } }),
          })
        : numberField({
            label: p.label,
            min: p.min ?? 0,
            max: p.max ?? Number.MAX_SAFE_INTEGER,
            step: p.step ?? 1,
            hint,
            get: () => current()[key] as number,
            set: (v) => v !== null && settings.update({ align: { [key]: v } }),
          });
    field.el.dataset.tune = key;
    return field;
  });
}

/** Sample text showing every word state, styled by the same CSS as the prompter. */
function preview(): HTMLElement {
  const words = (cls: string, text: string) =>
    text.split(' ').flatMap((w, i) => [i ? ' ' : '', h('span', { className: cls }, w)]);
  const text = h(
    'div',
    { className: 'prompter-text preview-text' },
    h('h2', { className: 'p-heading' }, 'Opening'),
    h(
      'p',
      { className: 'p-para' },
      ...words('w-spoken', 'Good morning, everyone.'),
      ' ',
      h('span', { className: 'w-current l-current' }, 'Thank'),
      ' ',
      h('span', { className: 'l-current' }, 'you'),
      ' ',
      h('span', { className: 'l-current' }, 'for'),
      ' ',
      ...words('', 'coming today.'),
      ' ',
      h('span', { className: 'w-dir' }, '[pause]'),
      ' ',
      ...words('', 'Let us begin.'),
    ),
  );
  return h(
    'div',
    { className: 'preview', ariaLabel: 'Preview', role: 'img' },
    h('div', { className: 'preview-stage' }, text),
  );
}

/** Settings view: Appearance, Run, Speech engine, Advanced (aligner tuning). */
export function createSettingsView(deps: ViewDeps): View {
  let root: HTMLElement | null = null;
  let off: (() => void) | null = null;
  return {
    mount(container: HTMLElement) {
      const fields = appearanceFields(deps.settings);
      const engine = engineFields(deps.settings);
      const reset = button('Reset appearance', () => deps.settings.reset('appearance'));
      const run = runFields(deps.settings);
      const tuning = tuningFields(deps.settings);
      let advanced = false;
      const tuningBox = h(
        'div',
        { className: 'tuning', hidden: true },
        h(
          'p',
          { className: 'field-hint' },
          'Voice-follow tuning. Changes apply immediately, even mid-run. Only change these if following misbehaves; “Reset tuning” restores the tested defaults.',
        ),
        button('Reset tuning to defaults', () => deps.settings.reset('align'), 'danger'),
        h('div', { className: 'fields tuning-fields' }, ...tuning.map((f) => f.el)),
      );
      const showAdvanced = toggleField({
        label: 'Show advanced',
        get: () => advanced,
        set: (v) => {
          advanced = v;
          tuningBox.hidden = !v;
        },
      });
      root = h(
        'section',
        { className: 'view view-settings' },
        navBar(),
        h('h1', {}, 'Settings'),
        h(
          'section',
          { className: 'settings-section', dataset: { section: 'appearance' } },
          h('h2', {}, 'Appearance'),
          h(
            'div',
            { className: 'appearance-grid' },
            h('div', { className: 'fields' }, ...fields.map((f) => f.el), reset),
            preview(),
          ),
        ),
        h(
          'section',
          { className: 'settings-section', dataset: { section: 'run' } },
          h('h2', {}, 'Run'),
          h('div', { className: 'fields' }, ...run.map((f) => f.el)),
        ),
        h(
          'section',
          { className: 'settings-section', dataset: { section: 'engine' } },
          h('h2', {}, 'Speech engine'),
          h(
            'p',
            { className: 'field-hint' },
            'With the browser speech service (Chrome), microphone audio is sent to Google to be transcribed and needs an internet connection. Changes apply the next time listening starts.',
          ),
          h('div', { className: 'fields' }, ...engine.map((f) => f.el)),
        ),
        h(
          'section',
          { className: 'settings-section', dataset: { section: 'tuning' } },
          h('h2', {}, 'Advanced'),
          showAdvanced.el,
          tuningBox,
        ),
      );
      container.append(root);
      off = deps.settings.on('change', ({ groups }) => {
        if (groups.includes('appearance')) for (const f of fields) f.sync();
        if (groups.includes('engine')) for (const f of engine) f.sync();
        if (groups.includes('run')) for (const f of run) f.sync();
        if (groups.includes('align')) for (const f of tuning) f.sync();
      });
    },
    unmount() {
      off?.();
      root?.remove();
      root = null;
    },
  };
}
