import type { View } from '../router';
import { placeholderView } from './placeholder';

/** Library view. Placeholder until its chunk fills it in. */
export function createLibraryView(): View {
  return placeholderView('Library');
}
