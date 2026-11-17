import type { View } from '../router';
import { placeholderView } from './placeholder';

/** Settings view. Placeholder until its chunk fills it in. */
export function createSettingsView(): View {
  return placeholderView('Settings');
}
