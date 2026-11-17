import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import {
  BACKUP_FORMAT,
  ScriptStore,
  compareForLibrary,
  memoryBackend,
  openIdbBackend,
  openScriptStore,
  parseRecord,
  type ScriptRecord,
} from './scripts';

function clock(start = 1000) {
  let t = start;
  return { now: () => t, advance: (ms = 1) => (t += ms) };
}

function ids() {
  let n = 0;
  return () => `id${++n}`;
}

async function idbStore(factory = new IDBFactory(), c = clock()) {
  const store = await openScriptStore(factory, { now: c.now, newId: ids() });
  return { store, factory, c };
}

describe('ScriptStore (IndexedDB)', () => {
  it('opens persistently and survives reopening', async () => {
    const { store, factory } = await idbStore();
    expect(store.persistent).toBe(true);
    const a = await store.create({ title: ' Sermon ', text: 'Hello world' });
    expect(a).toMatchObject({ id: 'id1', title: 'Sermon', text: 'Hello world', createdAt: 1000 });

    const reopened = await openScriptStore(factory);
    expect(reopened.get('id1')).toEqual(a);
  });

  it('update bumps updatedAt only on real changes', async () => {
    const { store, c } = await idbStore();
    await store.create({ title: 'A', text: 'one' });
    c.advance(10);
    expect((await store.update('id1', { text: 'one' })).updatedAt).toBe(1000);
    const u = await store.update('id1', { text: 'two', title: '' });
    expect(u).toMatchObject({ text: 'two', title: 'Untitled', updatedAt: 1010, createdAt: 1000 });
  });

  it('duplicate, delete, markOpened', async () => {
    const { store, factory, c } = await idbStore();
    await store.create({ title: 'A', text: 'x' });
    c.advance();
    const d = await store.duplicate('id1');
    expect(d).toMatchObject({ id: 'id2', title: 'A (copy)', text: 'x' });
    c.advance();
    await store.markOpened('id1');
    expect(store.get('id1')).toMatchObject({ lastOpenedAt: 1002, updatedAt: 1000 });
    expect(store.list().map((r) => r.id)).toEqual(['id1', 'id2']);
    await store.delete('id1');
    expect(store.get('id1')).toBeUndefined();
    expect((await openScriptStore(factory)).list().map((r) => r.id)).toEqual(['id2']);
  });

  it('emits change after writes', async () => {
    const { store } = await idbStore();
    const seen: number[] = [];
    store.on('change', ({ scripts }) => seen.push(scripts.length));
    await store.create({ title: 'A' });
    await store.duplicate('id1');
    await store.delete('id1');
    expect(seen).toEqual([1, 2, 1]);
  });

  it('returns copies, so callers cannot mutate the cache', async () => {
    const { store } = await idbStore();
    const r = await store.create({ title: 'A' });
    r.title = 'hacked';
    store.list()[0]!.title = 'hacked';
    expect(store.get('id1')!.title).toBe('A');
  });

  it('throws for unknown ids', async () => {
    const { store } = await idbStore();
    await expect(store.update('nope', { text: 'x' })).rejects.toThrow(/not found/);
  });
});

describe('backup', () => {
  it('round-trips through exportAll/importBackup', async () => {
    const { store } = await idbStore();
    await store.create({ title: 'A', text: 'alpha' });
    await store.create({ title: 'B', text: 'beta' });
    await store.markOpened('id1');
    const json = store.exportAll();
    expect(JSON.parse(json)).toMatchObject({ format: BACKUP_FORMAT, version: 1 });

    const { store: fresh } = await idbStore();
    expect(await fresh.importBackup(json)).toEqual({ added: 2, updated: 0, skipped: 0 });
    expect(fresh.list()).toEqual(store.list());
  });

  it('on id collision keeps the newer updatedAt', async () => {
    const rec = (id: string, text: string, updatedAt: number): ScriptRecord => ({
      id,
      title: id,
      text,
      createdAt: 0,
      updatedAt,
    });
    const store = await ScriptStore.open(
      memoryBackend([rec('old', 'local old', 100), rec('new', 'local new', 500)]),
    );
    const backup = JSON.stringify({
      format: BACKUP_FORMAT,
      version: 1,
      scripts: [rec('old', 'backup newer', 200), rec('new', 'backup older', 400), { bad: 1 }],
    });
    expect(await store.importBackup(backup)).toEqual({ added: 0, updated: 1, skipped: 2 });
    expect(store.get('old')!.text).toBe('backup newer');
    expect(store.get('new')!.text).toBe('local new');
  });

  it('dedupes ids within one file (newest wins)', async () => {
    const store = await ScriptStore.open(memoryBackend());
    const r = (text: string, updatedAt: number) => ({ id: 'x', title: 'X', text, updatedAt });
    const json = JSON.stringify({
      format: BACKUP_FORMAT,
      version: 1,
      scripts: [r('first', 1), r('second', 3), r('third', 2)],
    });
    expect(await store.importBackup(json)).toEqual({ added: 1, updated: 0, skipped: 2 });
    expect(store.get('x')!.text).toBe('second');
  });

  it('rejects non-backups', async () => {
    const store = await ScriptStore.open(memoryBackend());
    await expect(store.importBackup('not json')).rejects.toThrow(/bad JSON/);
    await expect(store.importBackup('{"scripts":[]}')).rejects.toThrow(/Not a Cadence/);
    await expect(
      store.importBackup(JSON.stringify({ format: BACKUP_FORMAT, version: 99, scripts: [] })),
    ).rejects.toThrow(/newer version/);
  });
});

describe('fallback', () => {
  it('uses an in-memory store when IndexedDB is missing', async () => {
    const store = await openScriptStore(undefined);
    expect(store.persistent).toBe(false);
    await store.create({ title: 'A' });
    expect(store.list()).toHaveLength(1);
  });

  it('uses an in-memory store when open() throws', async () => {
    const broken = {
      open: () => {
        throw new Error('blocked');
      },
    } as unknown as IDBFactory;
    expect((await openScriptStore(broken)).persistent).toBe(false);
    await expect(openIdbBackend(broken)).rejects.toThrow('blocked');
  });
});

describe('helpers', () => {
  it('parseRecord validates and fills defaults', () => {
    expect(parseRecord({ id: 'a', text: 't', updatedAt: 5 })).toEqual({
      id: 'a',
      title: 'Untitled',
      text: 't',
      createdAt: 5,
      updatedAt: 5,
    });
    expect(parseRecord({ id: '', text: 't', updatedAt: 5 })).toBeNull();
    expect(parseRecord({ id: 'a', text: 1, updatedAt: 5 })).toBeNull();
    expect(parseRecord({ id: 'a', text: 't' })).toBeNull();
  });

  it('compareForLibrary orders by max(opened, updated) desc', () => {
    const r = (title: string, updatedAt: number, lastOpenedAt?: number): ScriptRecord => ({
      id: title,
      title,
      text: '',
      createdAt: 0,
      updatedAt,
      ...(lastOpenedAt !== undefined ? { lastOpenedAt } : {}),
    });
    const sorted = [r('a', 1), r('b', 5), r('c', 2, 9), r('d', 5)].sort(compareForLibrary);
    expect(sorted.map((x) => x.title)).toEqual(['c', 'b', 'd', 'a']);
  });
});
