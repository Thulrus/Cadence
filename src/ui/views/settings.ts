import {
  HIGHLIGHT_MODES,
  SETTINGS_LIMITS,
  THEMES,
  type AppearanceSettings,
  type HighlightMode,
  type SettingsStore,
  type Theme,
} from '../../storage/settings';
import { FONT_FAMILIES, THEME_LABELS } from '../appearance';
import { button, h } from '../components/dom';
import {
  choiceField,
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

function laterSection(title: string, note: string, key: string): HTMLElement {
  return h(
    'section',
    { className: 'settings-section', dataset: { section: key } },
    h('h2', {}, title),
    h('p', { className: 'field-hint' }, note),
  );
}

/** Settings view. Appearance is complete; Run, Engine and Tuning sections are filled later. */
export function createSettingsView(deps: ViewDeps): View {
  let root: HTMLElement | null = null;
  let off: (() => void) | null = null;
  return {
    mount(container: HTMLElement) {
      const fields = appearanceFields(deps.settings);
      const reset = button('Reset appearance', () => deps.settings.reset('appearance'));
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
        laterSection('Run', 'Run mode and timed-scroll speed arrive in a later update.', 'run'),
        laterSection('Speech engine', 'Speech engine choice arrives in a later update.', 'engine'),
        laterSection(
          'Advanced / tuning',
          'Voice-follow tuning controls arrive in a later update.',
          'tuning',
        ),
      );
      container.append(root);
      off = deps.settings.on('change', ({ groups }) => {
        if (groups.includes('appearance')) for (const f of fields) f.sync();
      });
    },
    unmount() {
      off?.();
      root?.remove();
      root = null;
    },
  };
}
