import { estimateDurationSec, formatDuration, spokenWordCount } from '../../core/text/stats';
import { missingSamples } from '../../samples';
import type { ScriptRecord } from '../../storage/scripts';
import { button, h } from '../components/dom';
import { navBar } from '../components/nav';
import { BACKUP_ACCEPT, SCRIPT_ACCEPT, onFileDrop, pickFiles } from '../files';
import type { View } from '../router';
import { attempt, exportLibraryJson, exportScriptTxt, importFiles, type ViewDeps } from './deps';

type RowMode = { kind: 'rename'; id: string } | { kind: 'confirm-delete'; id: string } | null;

const formatDate = (t: number) =>
  new Date(t).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/** Script library: list, open, edit, rename, duplicate, delete, import/export. */
export function createLibraryView(deps: ViewDeps): View {
  const { scripts, navigate } = deps;
  let root: HTMLElement | null = null;
  let list: HTMLElement | null = null;
  let mode: RowMode = null;
  const cleanups: (() => void)[] = [];
  // Word counts are re-parsed only when a script's text changes.
  const counts = new Map<string, { updatedAt: number; words: number }>();

  const wordsFor = (r: ScriptRecord) => {
    const c = counts.get(r.id);
    if (c && c.updatedAt === r.updatedAt) return c.words;
    const words = spokenWordCount(r.text);
    counts.set(r.id, { updatedAt: r.updatedAt, words });
    return words;
  };

  const open = async (r: ScriptRecord) => {
    await attempt(deps, () => scripts.markOpened(r.id));
    navigate({ name: 'prompter', id: r.id });
  };

  /** Add the bundled sample scripts that aren't already in the library. */
  const addSamples = async () => {
    const todo = missingSamples(scripts.list());
    if (!todo.length) {
      deps.notices.show('The sample scripts are already in your library.');
      return;
    }
    // Reverse: the library lists newest first, so the first sample (the talk) ends up on top.
    for (const s of [...todo].reverse()) await attempt(deps, () => scripts.create(s));
    deps.notices.show(`Added ${todo.length} sample script${todo.length === 1 ? '' : 's'}.`);
  };

  const setMode = (m: RowMode) => {
    mode = m;
    render();
  };

  function titleCell(r: ScriptRecord): HTMLElement {
    if (mode?.kind !== 'rename' || mode.id !== r.id)
      return h('h2', { className: 'script-title' }, r.title);
    const input = h('input', {
      type: 'text',
      className: 'rename-input',
      value: r.title,
      ariaLabel: 'Script title',
    });
    const save = async () => {
      setMode(null);
      await attempt(deps, () => scripts.update(r.id, { title: input.value }));
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') void save();
      else if (e.key === 'Escape') setMode(null);
    });
    queueMicrotask(() => {
      input.focus();
      input.select();
    });
    return h(
      'div',
      { className: 'rename' },
      input,
      button('Save', () => void save(), 'primary'),
      button('Cancel', () => setMode(null)),
    );
  }

  function actions(r: ScriptRecord): HTMLElement {
    if (mode?.kind === 'confirm-delete' && mode.id === r.id) {
      return h(
        'div',
        { className: 'row-actions confirm' },
        h('span', {}, `Delete “${r.title}”? This can't be undone.`),
        button(
          'Delete',
          async () => {
            setMode(null);
            await attempt(deps, () => scripts.delete(r.id));
          },
          'danger',
        ),
        button('Cancel', () => setMode(null)),
      );
    }
    return h(
      'div',
      { className: 'row-actions' },
      button('Open', () => void open(r), 'primary'),
      button('Edit', () => navigate({ name: 'editor', id: r.id })),
      button('Rename', () => setMode({ kind: 'rename', id: r.id })),
      button('Duplicate', () => void attempt(deps, () => scripts.duplicate(r.id))),
      button('Export .txt', () => exportScriptTxt(r)),
      button('Delete', () => setMode({ kind: 'confirm-delete', id: r.id }), 'danger'),
    );
  }

  function row(r: ScriptRecord): HTMLElement {
    const words = wordsFor(r);
    const dur = formatDuration(estimateDurationSec(words, deps.settings.get().run.timedWpm));
    return h(
      'li',
      { className: 'script-row' },
      titleCell(r),
      h(
        'p',
        { className: 'script-meta' },
        `Updated ${formatDate(r.updatedAt)} · ${words} words · ~${dur}`,
      ),
      actions(r),
    );
  }

  function emptyState(): HTMLElement {
    return h(
      'div',
      { className: 'empty' },
      h('p', {}, 'No scripts yet.'),
      h(
        'p',
        {},
        'Choose “New script” and paste your text, use “Load file” to open a .txt or .md file, ' +
          'or drag a file onto this page.',
      ),
      h(
        'p',
        {},
        'Want to try it first? ',
        button('Add sample scripts', () => void addSamples(), 'primary'),
      ),
    );
  }

  function render(): void {
    if (!list) return;
    const all = scripts.list();
    if (mode && !all.some((r) => r.id === mode!.id)) mode = null;
    list.replaceChildren(...(all.length ? all.map(row) : [emptyState()]));
  }

  return {
    mount(container) {
      list = h('ul', { className: 'script-list' });
      const toolbar = h(
        'div',
        { className: 'toolbar' },
        button('New script', () => navigate({ name: 'editor' }), 'primary'),
        button('Load file', async () => {
          await importFiles(deps, await pickFiles(SCRIPT_ACCEPT, true));
        }),
        button('Export backup', () => exportLibraryJson(deps)),
        button('Import backup', async () => {
          await importFiles(deps, await pickFiles(BACKUP_ACCEPT));
        }),
        button('Add sample scripts', () => void addSamples()),
      );
      root = h(
        'section',
        { className: 'view view-library' },
        navBar(),
        h('h1', {}, 'Library'),
        toolbar,
        list,
      );
      cleanups.push(
        scripts.on('change', render),
        onFileDrop(root, (files) => void importFiles(deps, files)),
      );
      render();
      container.append(root);
    },
    unmount() {
      for (const c of cleanups.splice(0)) c();
      root?.remove();
      root = list = null;
    },
  };
}
