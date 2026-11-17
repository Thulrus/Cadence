import type { AppearanceSettings } from '../storage/settings';

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
