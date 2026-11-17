import { createHash, webcrypto } from 'node:crypto';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { ModelError, ModelStore, VOSK_IDBFS, voskModelPath, type ModelInfo } from './model';

const BASE = 'https://example.test/Cadence/models/';
const INFO: ModelInfo = {
  file: 'm.tar.gz',
  manifest: 'm.json',
  downloadBytes: 10,
  diskBytes: 20,
  lang: 'en',
};
const ARCHIVE = new Uint8Array(Array.from({ length: 1000 }, (_, i) => i % 251));
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
const MANIFEST = { file: INFO.file, bytes: ARCHIVE.length, sha256: sha(ARCHIVE) };

interface FakeServer {
  manifest?: unknown;
  archive?: Uint8Array;
  status?: number;
  /** Chunk size of the streamed body. */
  chunk?: number;
  /** Fail the body stream after this many bytes. */
  breakAt?: number;
}

function fakeFetch(srv: FakeServer): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (init?.signal?.aborted) throw new DOMException('aborted', 'AbortError');
    if (srv.status) return new Response('nope', { status: srv.status });
    if (url === BASE + INFO.manifest) return Response.json(srv.manifest ?? MANIFEST);
    if (url === BASE + INFO.file) {
      const data = srv.archive ?? ARCHIVE;
      const step = srv.chunk ?? 300;
      let off = 0;
      const body = new ReadableStream<Uint8Array>({
        pull(c) {
          if (init?.signal?.aborted) return c.error(new DOMException('aborted', 'AbortError'));
          if (srv.breakAt !== undefined && off >= srv.breakAt) return c.error(new TypeError('net'));
          if (off >= data.length) return c.close();
          c.enqueue(data.slice(off, off + step));
          off += step;
        },
      });
      return new Response(body);
    }
    return new Response('', { status: 404 });
  }) as typeof fetch;
}

function makeStore(srv: FakeServer = {}, idb = new IDBFactory()) {
  const persisted: boolean[] = [];
  const store = new ModelStore({
    baseUrl: BASE,
    fetch: fakeFetch(srv),
    indexedDB: idb,
    keyRange: IDBKeyRange,
    subtle: webcrypto.subtle as SubtleCrypto,
    storage: {
      persist: async () => (persisted.push(true), true),
      estimate: async () => ({ usage: 1234, quota: 1e9 }),
    },
    info: INFO,
  });
  return { store, idb, persisted };
}

/** Read the IDBFS records the way vosk-browser's Emscripten IDBFS would. */
async function idbfsEntries(idb: IDBFactory): Promise<Map<string, Record<string, unknown>>> {
  const db = await new Promise<IDBDatabase>((res, rej) => {
    const r = idb.open(VOSK_IDBFS.db, VOSK_IDBFS.version);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  const store = db.transaction(VOSK_IDBFS.store, 'readonly').objectStore(VOSK_IDBFS.store);
  expect(store.indexNames.contains(VOSK_IDBFS.index)).toBe(true);
  const out = new Map<string, Record<string, unknown>>();
  await new Promise<void>((res) => {
    store.openCursor().onsuccess = (e) => {
      const c = (e.target as IDBRequest<IDBCursorWithValue | null>).result;
      if (!c) return res();
      out.set(String(c.key), c.value as Record<string, unknown>);
      c.continue();
    };
  });
  db.close();
  return out;
}

describe('voskModelPath', () => {
  it('matches vosk-browser: /vosk/ + url with non-word chars as _', () => {
    expect(voskModelPath('https://a.b/Cadence/models/x-1.tar.gz')).toBe(
      '/vosk/https___a_b_Cadence_models_x_1_tar_gz',
    );
  });
});

describe('ModelStore', () => {
  it('downloads with progress, verifies, persists and seeds IDBFS', async () => {
    const { store, idb, persisted } = makeStore();
    expect(store.url).toBe(BASE + INFO.file);
    expect(await store.isInstalled()).toBe(false);
    const progress: number[] = [];
    await store.download((p) => {
      expect(p.total).toBe(ARCHIVE.length);
      progress.push(p.loaded);
    });
    expect(progress[0]).toBe(0);
    expect(progress.at(-1)).toBe(ARCHIVE.length);
    expect(progress).toEqual([...progress].sort((a, b) => a - b));
    expect(persisted).toEqual([true]);
    expect(await store.isInstalled()).toBe(true);

    const entries = await idbfsEntries(idb);
    const dir = entries.get(store.path)!;
    expect(dir.mode).toBe(VOSK_IDBFS.dirMode);
    expect(dir.timestamp).toBeInstanceOf(Date);
    const archive = entries.get(`${store.path}/${VOSK_IDBFS.archive}`)!;
    expect(archive.mode).toBe(VOSK_IDBFS.fileMode);
    expect(sha(archive.contents as Uint8Array)).toBe(MANIFEST.sha256);
    expect(entries.has(`${store.path}/${VOSK_IDBFS.downloadedMarker}`)).toBe(true);
    // Keys sort directory-first, which IDBFS needs to recreate the tree.
    expect([...entries.keys()].sort()[0]).toBe(store.path);
  });

  it('counts an archive Vosk has already unpacked as installed', async () => {
    const { store, idb } = makeStore();
    await store.download();
    // Simulate vosk-browser after first load: archive + marker replaced by extracted files.
    const db = await new Promise<IDBDatabase>((res) => {
      const r = idb.open(VOSK_IDBFS.db, VOSK_IDBFS.version);
      r.onsuccess = () => res(r.result);
    });
    const tx = db.transaction(VOSK_IDBFS.store, 'readwrite');
    const os = tx.objectStore(VOSK_IDBFS.store);
    os.delete(`${store.path}/${VOSK_IDBFS.archive}`);
    os.delete(`${store.path}/${VOSK_IDBFS.downloadedMarker}`);
    os.put({ timestamp: new Date(), mode: VOSK_IDBFS.fileMode }, `${store.path}/extracted.ok`);
    os.put({ timestamp: new Date(), mode: VOSK_IDBFS.fileMode }, `${store.path}/am/final.mdl`);
    await new Promise((r) => (tx.oncomplete = r));
    db.close();
    expect(await store.isInstalled()).toBe(true);
  });

  it('remove deletes this model only', async () => {
    const idb = new IDBFactory();
    const { store } = makeStore({}, idb);
    await store.download();
    const other = new ModelStore({
      baseUrl: BASE,
      fetch: fakeFetch({ manifest: { ...MANIFEST, file: 'n.tar.gz' } }),
      indexedDB: idb,
      keyRange: IDBKeyRange,
      subtle: webcrypto.subtle as SubtleCrypto,
      info: { ...INFO, file: 'n.tar.gz', manifest: INFO.manifest },
    });
    // Seed a second model under a different URL by hand-crafting its marker.
    const otherKey = `${other.path}/${VOSK_IDBFS.extractedMarker}`;
    const db = await new Promise<IDBDatabase>((res) => {
      const r = idb.open(VOSK_IDBFS.db, VOSK_IDBFS.version);
      r.onsuccess = () => res(r.result);
    });
    const tx = db.transaction(VOSK_IDBFS.store, 'readwrite');
    tx.objectStore(VOSK_IDBFS.store).put({ timestamp: new Date(), mode: 1 }, otherKey);
    await new Promise((r) => (tx.oncomplete = r));
    db.close();

    await store.remove();
    expect(await store.isInstalled()).toBe(false);
    expect(await other.isInstalled()).toBe(true);
    expect([...(await idbfsEntries(idb)).keys()]).toEqual([otherKey]);
  });

  it('rejects a damaged download and installs nothing', async () => {
    const bad = ARCHIVE.slice();
    bad[10] = bad[10]! ^ 1;
    const { store } = makeStore({ archive: bad });
    await expect(store.download()).rejects.toMatchObject({ kind: 'integrity' });
    expect(await store.isInstalled()).toBe(false);
  });

  it('rejects a short or long body', async () => {
    await expect(makeStore({ archive: ARCHIVE.slice(1) }).store.download()).rejects.toMatchObject({
      kind: 'integrity',
    });
    const long = new Uint8Array(ARCHIVE.length + 5);
    await expect(makeStore({ archive: long }).store.download()).rejects.toMatchObject({
      kind: 'integrity',
    });
  });

  it('network failures and missing builds are reported as such', async () => {
    await expect(makeStore({ breakAt: 300 }).store.download()).rejects.toMatchObject({
      kind: 'network',
    });
    await expect(makeStore({ status: 404 }).store.download()).rejects.toMatchObject({
      kind: 'missing',
    });
    await expect(makeStore({ status: 500 }).store.download()).rejects.toMatchObject({
      kind: 'network',
    });
    await expect(
      makeStore({ manifest: { ...MANIFEST, file: 'other' } }).store.download(),
    ).rejects.toMatchObject({ kind: 'missing' });
    await expect(
      makeStore({ manifest: { file: INFO.file, bytes: 'x' } }).store.download(),
    ).rejects.toBeInstanceOf(ModelError);
  });

  it('cancel aborts mid-download', async () => {
    const { store } = makeStore({ chunk: 100 });
    const ac = new AbortController();
    const p = store.download((pr) => {
      if (pr.loaded >= 300) ac.abort();
    }, ac.signal);
    await expect(p).rejects.toMatchObject({ kind: 'aborted' });
    expect(await store.isInstalled()).toBe(false);
  });

  it('reports storage usage', async () => {
    expect(await makeStore().store.usage()).toBe(1234);
  });
});
