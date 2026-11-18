import { estimateDurationSec, formatDuration, spokenWordCount } from '../../core/text/stats';
import { Autosaver } from '../autosave';
import { button, h } from '../components/dom';
import { navBar } from '../components/nav';
import { SCRIPT_ACCEPT, deriveTitle, onFileDrop, pickFiles } from '../files';
import { routeHash, type Route, type View } from '../router';
import { exportScriptTxt, importFiles, type ViewDeps } from './deps';

export const EDITOR_CONFIG = {
  /** Autosave this long after the last keystroke. */
  autosaveDelayMs: 600,
  /** Recompute word count / duration this long after the last keystroke. */
  statsDelayMs: 150,
} as const;

const CHEAT_SHEET: [syntax: string, meaning: string][] = [
  ['# Heading', 'Shown larger; not read aloud'],
  ['[stage direction]', 'Shown in colour; skipped by voice follow'],
  ['[ad-lib: note]', 'Voice holds here until you start the next line'],
  ['*emphasis*', 'Shown emphasized'],
  ['Blank line', 'New paragraph'],
];

/** Script editor with debounced autosave. `#/editor` (no id) creates a script on first input. */
export function createEditorView(deps: ViewDeps): View {
  const { scripts, settings, notices, navigate } = deps;
  let root: HTMLElement | null = null;
  let saver: Autosaver | null = null;
  const cleanups: (() => void)[] = [];

  function notFound(container: HTMLElement, id: string): void {
    root = h(
      'section',
      { className: 'view view-editor' },
      navBar(),
      h('h1', {}, 'Script not found'),
      h('p', {}, `No script with id “${id}”. It may have been deleted.`),
      h('a', { href: routeHash({ name: 'library' }), className: 'btn btn-primary' }, 'Library'),
    );
    container.append(root);
  }

  return {
    mount(container: HTMLElement, route: Route) {
      let id = route.id;
      const rec = id ? scripts.get(id) : undefined;
      if (id && !rec) return notFound(container, id);

      const titleInput = h('input', {
        type: 'text',
        className: 'editor-title',
        value: rec?.title ?? '',
        placeholder: 'Untitled',
        ariaLabel: 'Script title',
      });
      const textarea = h('textarea', {
        className: 'editor-text',
        value: rec?.text ?? '',
        placeholder: 'Paste or type your script here…',
        ariaLabel: 'Script text',
        spellcheck: true,
      });
      const status = h('span', { className: 'save-status' }, rec ? 'Saved' : '');
      status.setAttribute('aria-live', 'polite');
      const stats = h('p', { className: 'editor-stats' });
      const startBtn = button('Start prompter', () => void start(), 'primary');
      const exportBtn = button('Export .txt', () => {
        void saver!.flush().then(() => {
          const r = id && scripts.get(id);
          if (r) exportScriptTxt(r);
        });
      });

      const syncButtons = () => {
        startBtn.disabled = exportBtn.disabled = !id;
      };

      const updateStats = () => {
        const words = spokenWordCount(textarea.value);
        const wpm = settings.get().run.timedWpm;
        const dur = formatDuration(estimateDurationSec(words, wpm));
        stats.textContent = `${words} words · ~${dur} at ${wpm} wpm`;
      };
      let statsTimer: ReturnType<typeof setTimeout> | undefined;
      const scheduleStats = () => {
        clearTimeout(statsTimer);
        statsTimer = setTimeout(updateStats, EDITOR_CONFIG.statsDelayMs);
      };

      const save = async () => {
        const title = titleInput.value;
        const text = textarea.value;
        if (!id) {
          if (!title.trim() && !text.trim()) return;
          const autoTitle = title.trim() || deriveTitle(text);
          const created = await scripts.create({ title: autoTitle, text });
          id = created.id;
          if (!titleInput.value.trim()) titleInput.value = created.title;
          // Update the URL without remounting (replaceState fires no hashchange).
          history.replaceState(null, '', routeHash({ name: 'editor', id }));
          syncButtons();
        } else {
          await scripts.update(id, { title, text });
        }
        status.textContent = saver?.pending ? 'Unsaved changes' : 'Saved';
      };

      saver = new Autosaver(save, EDITOR_CONFIG.autosaveDelayMs, (e) => {
        status.textContent = 'Not saved';
        notices.show(`Couldn't save: ${e instanceof Error ? e.message : String(e)}`, 'error');
      });

      const onEdit = () => {
        status.textContent = 'Unsaved changes';
        saver!.schedule();
      };

      async function start(): Promise<void> {
        await saver!.flush();
        if (!id) return;
        try {
          await scripts.markOpened(id);
        } catch {
          // Ordering only; not worth blocking the prompter.
        }
        navigate({ name: 'prompter', id });
      }

      titleInput.addEventListener('input', onEdit);
      textarea.addEventListener('input', () => {
        onEdit();
        scheduleStats();
      });

      const onHide = () => void saver?.flush();
      const onVisibility = () => document.visibilityState === 'hidden' && onHide();
      window.addEventListener('pagehide', onHide);
      document.addEventListener('visibilitychange', onVisibility);

      const loadFile = async () => {
        const [first] = await importFiles(deps, await pickFiles(SCRIPT_ACCEPT));
        if (first) navigate({ name: 'editor', id: first.id });
      };

      const cheat = h(
        'details',
        { className: 'cheat-sheet' },
        h('summary', {}, 'Formatting help'),
        h(
          'dl',
          {},
          ...CHEAT_SHEET.flatMap(([syntax, meaning]) => [
            h('dt', {}, h('code', {}, syntax)),
            h('dd', {}, meaning),
          ]),
        ),
      );

      root = h(
        'section',
        { className: 'view view-editor' },
        navBar(),
        h(
          'div',
          { className: 'toolbar' },
          titleInput,
          startBtn,
          button('Load file', () => void loadFile()),
          exportBtn,
          status,
        ),
        textarea,
        h('div', { className: 'editor-footer' }, stats, cheat),
      );

      cleanups.push(
        () => {
          window.removeEventListener('pagehide', onHide);
          document.removeEventListener('visibilitychange', onVisibility);
          clearTimeout(statsTimer);
        },
        settings.on('change', ({ groups }) => groups.includes('run') && updateStats()),
        onFileDrop(root, async (files) => {
          const created = await importFiles(deps, files);
          const last = created[created.length - 1];
          if (last) navigate({ name: 'editor', id: last.id });
        }),
      );

      syncButtons();
      updateStats();
      container.append(root);
      if (!rec) textarea.focus();
    },
    unmount() {
      void saver?.flush();
      saver = null;
      for (const c of cleanups.splice(0)) c();
      root?.remove();
      root = null;
    },
  };
}
