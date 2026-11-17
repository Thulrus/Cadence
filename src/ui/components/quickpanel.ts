import {
  ENGINE_CHOICES,
  SETTINGS_LIMITS,
  THEMES,
  type EngineChoice,
  type SettingsStore,
} from '../../storage/settings';
import { THEME_LABELS, stepFontSize } from '../appearance';
import { routeHash } from '../router';
import { button, h } from './dom';
import { rangeField, selectField, toggleField } from './fields';
import { ENGINE_LABELS, targetField } from '../views/settings';

export interface QuickPanel {
  /** Top-bar button that opens/closes the panel. */
  toggle: HTMLButtonElement;
  panel: HTMLElement;
  close(): void;
  destroy(): void;
}

/**
 * Compact in-run panel (font size −/+, reading line, theme, speech engine, mirror/flip, target time). Lives inside the prompter
 * view so opening it never loses the reading position.
 */
export function createQuickPanel(settings: SettingsStore): QuickPanel {
  const a = () => settings.get().appearance;
  const setSize = (steps: number) =>
    settings.update({
      appearance: { fontSizePx: stepFontSize(a().fontSizePx, steps, SETTINGS_LIMITS.fontSizePx) },
    });

  const sizeOut = h('output', { className: 'quick-size', ariaLive: 'polite' });
  const smaller = button('A−', () => setSize(-1), 'plain', { ariaLabel: 'Smaller text' });
  const larger = button('A+', () => setSize(1), 'plain', { ariaLabel: 'Larger text' });
  const fields = [
    rangeField({
      label: 'Reading line',
      unit: '% from top',
      ...SETTINGS_LIMITS.readingLinePct,
      step: 1,
      get: () => a().readingLinePct,
      set: (readingLinePct) => settings.update({ appearance: { readingLinePct } }),
    }),
    selectField({
      label: 'Theme',
      options: THEMES.map((t) => ({ value: t, label: THEME_LABELS[t] })),
      get: () => a().theme,
      set: (theme) => settings.update({ appearance: { theme: theme as (typeof THEMES)[number] } }),
    }),
    // Switching engines mid-run keeps the position (the prompter swaps engines in place).
    selectField({
      label: 'Speech engine',
      options: ENGINE_CHOICES.map((c) => ({ value: c, label: ENGINE_LABELS[c] })),
      get: () => settings.get().engine.choice,
      set: (choice) => settings.update({ engine: { choice: choice as EngineChoice } }),
    }),
    toggleField({
      label: 'Mirror',
      get: () => a().mirrorX,
      set: (mirrorX) => settings.update({ appearance: { mirrorX } }),
    }),
    toggleField({
      label: 'Flip vertically',
      get: () => a().flipY,
      set: (flipY) => settings.update({ appearance: { flipY } }),
    }),
  ];
  const target = targetField(settings, 'Target time');
  const syncSize = () => {
    const { fontSizePx } = a();
    const L = SETTINGS_LIMITS.fontSizePx;
    sizeOut.value = `${fontSizePx}px`;
    smaller.disabled = fontSizePx <= L.min;
    larger.disabled = fontSizePx >= L.max;
  };

  const panel = h(
    'div',
    { className: 'quick-panel', id: 'quick-panel', role: 'dialog', ariaLabel: 'Display options' },
    h(
      'div',
      { className: 'quick-row', role: 'group', ariaLabel: 'Text size' },
      smaller,
      sizeOut,
      larger,
    ),
    ...fields.map((f) => f.el),
    target.el,
    h('a', { href: routeHash({ name: 'settings' }), className: 'btn' }, 'All settings…'),
  );
  panel.hidden = true;

  const toggle = button('Aa', () => (panel.hidden ? open() : close()), 'plain', {
    ariaLabel: 'Display options',
    title: 'Display options',
  });
  toggle.setAttribute('aria-controls', 'quick-panel');
  toggle.setAttribute('aria-expanded', 'false');

  function open(): void {
    panel.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
    smaller.focus();
  }
  function close(): void {
    if (panel.hidden) return;
    const hadFocus = panel.contains(document.activeElement);
    panel.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
    if (hadFocus) toggle.focus();
  }

  const onDocPointer = (e: PointerEvent) => {
    const t = e.target as Node | null;
    if (panel.hidden || !t || panel.contains(t) || toggle.contains(t)) return;
    // A tap outside only dismisses: don't let it reach the text and move the position.
    e.stopPropagation();
    close();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
  };
  document.addEventListener('pointerdown', onDocPointer, true);
  document.addEventListener('keydown', onKey);
  const off = settings.on('change', ({ groups }) => {
    if (groups.includes('run')) target.sync();
    if (!groups.includes('appearance') && !groups.includes('engine')) return;
    syncSize();
    for (const f of fields) f.sync();
  });
  syncSize();

  return {
    toggle,
    panel,
    close,
    destroy() {
      off();
      document.removeEventListener('pointerdown', onDocPointer, true);
      document.removeEventListener('keydown', onKey);
    },
  };
}
