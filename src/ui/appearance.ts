import type { AppearanceSettings, Theme } from '../storage/settings';

export const THEME_LABELS: Record<Theme, string> = {
  dark: 'Dark',
  light: 'Light',
  'high-contrast': 'High contrast',
  'green-on-black': 'Green on black',
};

/** CSS custom properties derived from appearance settings (pure, so it's testable). */
export function appearanceVars(a: AppearanceSettings): Record<string, string> {
  return {
    '--prompt-font-family': a.fontFamily,
    '--prompt-font-size': `${a.fontSizePx}px`,
    '--prompt-line-height': String(a.lineHeight),
    '--prompt-column': `${a.columnChars}ch`,
    '--prompt-margin': `${a.marginPct}vw`,
    '--prompt-spoken-opacity': String(a.spokenDim),
    '--prompt-reading-line': `${a.readingLinePct}%`,
    '--prompt-scale-x': a.mirrorX ? '-1' : '1',
    '--prompt-scale-y': a.flipY ? '-1' : '1',
  };
}

/** Apply appearance to the document root: `data-theme`, `data-highlight`, and CSS vars. */
export function applyAppearance(root: HTMLElement, a: AppearanceSettings): void {
  root.dataset.theme = a.theme;
  root.dataset.highlight = a.highlight;
  for (const [name, value] of Object.entries(appearanceVars(a)))
    root.style.setProperty(name, value);
}

export const APPEARANCE_UI_CONFIG = {
  /** Font size change per −/+ press (quick overlay, and `[`/`]` keys in chunk 14). */
  fontStepPx: 4,
} as const;

/**
 * Legible system font stacks. No web fonts: nothing is fetched at runtime and no font files are
 * bundled yet. The first entry's stack must equal DEFAULT_SETTINGS.appearance.fontFamily.
 */
export const FONT_FAMILIES: readonly { id: string; label: string; stack: string }[] = [
  { id: 'sans', label: 'Sans-serif', stack: 'system-ui, sans-serif' },
  { id: 'serif', label: 'Serif', stack: 'Georgia, "Noto Serif", "Times New Roman", serif' },
  {
    id: 'rounded',
    label: 'Rounded',
    stack: 'ui-rounded, "SF Pro Rounded", Nunito, "Varela Round", system-ui, sans-serif',
  },
  {
    id: 'mono',
    label: 'Monospace',
    stack: 'ui-monospace, "Roboto Mono", "DejaVu Sans Mono", Menlo, Consolas, monospace',
  },
];

/** Id of the FONT_FAMILIES entry whose stack equals `stack`, or 'custom'. */
export function fontFamilyId(stack: string): string {
  return FONT_FAMILIES.find((f) => f.stack === stack)?.id ?? 'custom';
}

/** Font size after `steps` presses of −/+ (negative = smaller), clamped to the settings limits. */
export function stepFontSize(
  current: number,
  steps: number,
  limits: { min: number; max: number },
  stepPx: number = APPEARANCE_UI_CONFIG.fontStepPx,
): number {
  return Math.min(limits.max, Math.max(limits.min, Math.round(current + steps * stepPx)));
}
