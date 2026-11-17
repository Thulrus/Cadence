import type { View } from '../router';
import { placeholderView } from './placeholder';

/** Prompter view. Placeholder until its chunk fills it in. */
export function createPrompterView(): View {
  return placeholderView('Prompter');
}
