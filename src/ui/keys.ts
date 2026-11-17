/**
 * Prompter keyboard / presentation-clicker map (SPEC §9). The map itself is pure and tested;
 * `isTypingTarget` decides when keys belong to a form control instead.
 *
 * Clickers: most send PageDown (next) / PageUp (previous); some send ArrowRight / ArrowLeft
 * (mapped like Down / Up, one line) and a "blank screen" button sending `b` or `.` (mapped
 * to pause/resume, like Space). F5 / Shift+F5 / Escape from the "start/stop slideshow" button:
 * Escape shows the controls; F5 is left to the browser.
 */

export type KeyAction =
  | 'toggle-run'
  | 'line-next'
  | 'line-prev'
  | 'para-next'
  | 'para-prev'
  | 'home'
  | 'font-smaller'
  | 'font-larger'
  | 'fullscreen'
  | 'show-controls';

export interface KeyInput {
  key: string;
  ctrlKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
}

const KEYMAP: Readonly<Record<string, KeyAction>> = {
  ' ': 'toggle-run',
  Spacebar: 'toggle-run',
  b: 'toggle-run',
  B: 'toggle-run',
  '.': 'toggle-run',
  ArrowDown: 'line-next',
  ArrowRight: 'line-next',
  ArrowUp: 'line-prev',
  ArrowLeft: 'line-prev',
  PageDown: 'para-next',
  PageUp: 'para-prev',
  Home: 'home',
  '[': 'font-smaller',
  ']': 'font-larger',
  f: 'fullscreen',
  F: 'fullscreen',
  Escape: 'show-controls',
};

/** The prompter action for a key press, or null. Ctrl/Alt/Meta chords are left to the browser. */
export function actionForKey(e: KeyInput): KeyAction | null {
  if (e.ctrlKey || e.altKey || e.metaKey) return null;
  return KEYMAP[e.key] ?? null;
}

/** Minimal element shape for `isTypingTarget` (testable without a DOM). */
export interface KeyTargetLike {
  tagName?: string;
  isContentEditable?: boolean;
}

const TEXT_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

/**
 * True when a key press should go to the focused control: text fields, selects, and any
 * <input> (radios/sliders use arrows). A focused button keeps Space/Enter for itself.
 */
export function isTypingTarget(t: KeyTargetLike | null, key: string): boolean {
  if (!t) return false;
  if (t.isContentEditable) return true;
  const tag = t.tagName?.toUpperCase() ?? '';
  if (TEXT_TAGS.has(tag)) return true;
  if ((tag === 'BUTTON' || tag === 'A') && (key === ' ' || key === 'Enter')) return true;
  return false;
}
