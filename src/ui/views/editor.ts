import type { View } from '../router';
import { placeholderView } from './placeholder';

/** Editor view. Placeholder until its chunk fills it in. */
export function createEditorView(): View {
  return placeholderView('Editor');
}
