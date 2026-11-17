import { openScriptStore, type ScriptStore } from './storage/scripts';
import { SettingsStore, memoryStorage, type StorageAdapter } from './storage/settings';
import { applyAppearance } from './ui/appearance';
import { h } from './ui/components/dom';
import { createNotices } from './ui/components/notice';
import { Router } from './ui/router';
import type { ViewDeps } from './ui/views/deps';
import { createEditorView } from './ui/views/editor';
import { createLibraryView } from './ui/views/library';
import { createPrompterView } from './ui/views/prompter';
import { createSettingsView } from './ui/views/settings';

export interface App {
  settings: SettingsStore;
  scripts: ScriptStore;
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

/** IndexedDB factory, or undefined when absent or blocked. */
function browserIndexedDb(): IDBFactory | undefined {
  try {
    return window.indexedDB ?? undefined;
  } catch {
    return undefined;
  }
}

/** Composition root: builds stores and the router, applies settings, mounts views. */
export async function createApp(container: HTMLElement): Promise<App> {
  const settings = new SettingsStore(browserStorage());
  const root = document.documentElement;
  applyAppearance(root, settings.get().appearance);
  settings.on('change', ({ settings: s, groups }) => {
    if (groups.includes('appearance')) applyAppearance(root, s.appearance);
  });

  const notices = createNotices();
  const viewHost = h('div', { className: 'view-host' });
  container.replaceChildren(notices.el, viewHost);

  const scripts = await openScriptStore(browserIndexedDb());
  if (!scripts.persistent) {
    notices.show(
      "This browser isn't allowing on-device storage (private mode?). " +
        'Scripts will be lost when you close the page; use Export backup to keep them.',
      'warning',
      0,
    );
  }

  const deps: ViewDeps = {
    scripts,
    settings,
    notices,
    navigate: (route) => router.navigate(route),
  };
  const router: Router = new Router(viewHost, {
    library: () => createLibraryView(deps),
    editor: () => createEditorView(deps),
    prompter: () => createPrompterView(deps),
    settings: () => createSettingsView(deps),
  });
  router.start();

  return { settings, scripts, router };
}
