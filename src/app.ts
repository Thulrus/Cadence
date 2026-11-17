import { SettingsStore, memoryStorage, type StorageAdapter } from './storage/settings';
import { applyAppearance } from './ui/appearance';
import { Router } from './ui/router';
import { createEditorView } from './ui/views/editor';
import { createLibraryView } from './ui/views/library';
import { createPrompterView } from './ui/views/prompter';
import { createSettingsView } from './ui/views/settings';

export interface App {
  settings: SettingsStore;
  router: Router;
}

/** localStorage when available; in-memory fallback (e.g. storage disabled). */
function browserStorage(): StorageAdapter {
  try {
    const ls = window.localStorage;
    if (ls) return ls;
  } catch {
    // Access can throw when storage is blocked.
  }
  return memoryStorage();
}

/** Composition root: builds stores and the router, applies settings, mounts views. */
export function createApp(container: HTMLElement): App {
  const settings = new SettingsStore(browserStorage());
  const root = document.documentElement;
  applyAppearance(root, settings.get().appearance);
  settings.on('change', ({ settings: s, groups }) => {
    if (groups.includes('appearance')) applyAppearance(root, s.appearance);
  });

  const router = new Router(container, {
    library: createLibraryView,
    editor: createEditorView,
    prompter: createPrompterView,
    settings: createSettingsView,
  });
  router.start();

  return { settings, router };
}
