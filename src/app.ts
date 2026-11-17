import { ModelStore } from './engines/offline/model';
import { disposeVoskModel, warmVoskRuntime } from './engines/offline/vosk';
import { openScriptStore, type ScriptStore } from './storage/scripts';
import { SettingsStore, memoryStorage, type StorageAdapter } from './storage/settings';
import { applyAppearance } from './ui/appearance';
import { button, h } from './ui/components/dom';
import { navBar } from './ui/components/nav';
import { createErrorReporter, errorMessage, installGlobalErrorHandler } from './ui/errors';
import { createNotices, type Notices } from './ui/components/notice';
import { OfflineModelService } from './ui/offline';
import { Router, parseRoute } from './ui/router';
import { createUpdateBanner, type UpdateBanner } from './ui/update';
import type { ViewDeps } from './ui/views/deps';
import { createEditorView } from './ui/views/editor';
import { createLibraryView } from './ui/views/library';
import { createPrompterView } from './ui/views/prompter';
import { createSettingsView } from './ui/views/settings';

export interface App {
  settings: SettingsStore;
  scripts: ScriptStore;
  router: Router;
  notices: Notices;
  /** Service-worker update banner; main.ts feeds it from the SW registration. */
  updates: UpdateBanner;
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

/**
 * Composition root: builds stores and the router, applies settings, mounts views.
 * `applyUpdate` activates a waiting service worker and reloads; it runs only on user tap.
 */
export async function createApp(
  container: HTMLElement,
  applyUpdate: () => void = () => location.reload(),
): Promise<App> {
  const settings = new SettingsStore(browserStorage());
  const root = document.documentElement;
  applyAppearance(root, settings.get().appearance);
  settings.on('change', ({ settings: s, groups }) => {
    if (groups.includes('appearance')) applyAppearance(root, s.appearance);
  });

  const notices = createNotices();
  const viewHost = h('div', { className: 'view-host' });
  const updates = createUpdateBanner(() => parseRoute(location.hash).name, applyUpdate);
  window.addEventListener('hashchange', () => updates.refresh());
  container.replaceChildren(updates.el, notices.el, viewHost);
  installGlobalErrorHandler(window, createErrorReporter({ show: (m) => notices.show(m, 'error') }));

  const scripts = await openScriptStore(browserIndexedDb());
  if (!scripts.persistent) {
    notices.show(
      "This browser isn't allowing on-device storage (private mode?). " +
        'Scripts will be lost when you close the page; use Export backup to keep them.',
      'warning',
      0,
    );
  }

  const idb = browserIndexedDb();
  const modelStore =
    idb && globalThis.crypto?.subtle
      ? new ModelStore({
          baseUrl: new URL(`${import.meta.env.BASE_URL}models/`, location.href).href,
          fetch: (input, init) => fetch(input, init),
          indexedDB: idb,
          subtle: crypto.subtle,
          storage: navigator.storage,
        })
      : null;
  const offline = new OfflineModelService(modelStore, settings, disposeVoskModel, warmVoskRuntime);
  void offline.refresh();

  const deps: ViewDeps = {
    scripts,
    settings,
    notices,
    offline,
    navigate: (route) => router.navigate(route),
  };
  const router: Router = new Router(
    viewHost,
    {
      library: () => createLibraryView(deps),
      editor: () => createEditorView(deps),
      prompter: () => createPrompterView(deps),
      settings: () => createSettingsView(deps),
    },
    (e) => {
      console.error('[cadence] view failed to open:', e);
      return h(
        'section',
        { className: 'view view-error' },
        navBar(),
        h('h1', {}, 'This page couldn’t be opened'),
        h('p', {}, `Error: ${errorMessage(e)}. Your scripts are safe.`),
        h(
          'p',
          {},
          button('Back to library', () => router.navigate({ name: 'library' }), 'primary'),
          ' ',
          button('Reload', () => location.reload()),
        ),
      );
    },
  );
  router.start();

  return { settings, scripts, router, notices, updates };
}
