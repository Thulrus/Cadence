import { Emitter } from '../core/emitter';

/** On-device script library (IndexedDB, in-memory fallback). See chunk 03 brief. */

export interface ScriptRecord {
  id: string;
  title: string;
  text: string;
  /** Epoch ms. */
  createdAt: number;
  updatedAt: number;
  lastOpenedAt?: number;
}

export type ScriptPatch = Partial<Pick<ScriptRecord, 'title' | 'text'>>;

export interface ScriptStoreEvents extends Record<string, unknown> {
  change: { scripts: ScriptRecord[] };
}

export interface ImportResult {
  added: number;
  updated: number;
  skipped: number;
}

/** Persistence backend. The store keeps its own cache and writes through. */
export interface ScriptBackend {
  /** False for the in-memory fallback (scripts won't survive reload). */
  readonly persistent: boolean;
  getAll(): Promise<ScriptRecord[]>;
  putMany(records: ScriptRecord[]): Promise<void>;
  delete(id: string): Promise<void>;
}

export const BACKUP_FORMAT = 'cadence-backup';
export const BACKUP_VERSION = 1;

export const SCRIPT_STORE_CONFIG = {
  dbName: 'cadence',
  dbVersion: 1,
  storeName: 'scripts',
  /** Give up on IndexedDB if open() neither succeeds nor fails within this time. */
  openTimeoutMs: 3000,
  defaultTitle: 'Untitled',
  copySuffix: ' (copy)',
} as const;

export interface ScriptStoreOptions {
  now?: () => number;
  newId?: () => string;
}

/** Random id; `crypto.randomUUID` needs a secure context, so fall back for plain-http LAN dev. */
export function defaultId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Library order: most recently opened or updated first; ties by title. */
export function compareForLibrary(a: ScriptRecord, b: ScriptRecord): number {
  const ka = Math.max(a.updatedAt, a.lastOpenedAt ?? 0);
  const kb = Math.max(b.updatedAt, b.lastOpenedAt ?? 0);
  return kb - ka || a.title.localeCompare(b.title);
}

const isRec = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isTime = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;

/** Validate one untrusted record (from a backup file). Returns null if unusable. */
export function parseRecord(raw: unknown): ScriptRecord | null {
  if (!isRec(raw)) return null;
  const { id, title, text, createdAt, updatedAt, lastOpenedAt } = raw;
  if (typeof id !== 'string' || id === '' || typeof text !== 'string') return null;
  if (!isTime(updatedAt)) return null;
  const rec: ScriptRecord = {
    id,
    title:
      typeof title === 'string' && title.trim() ? title.trim() : SCRIPT_STORE_CONFIG.defaultTitle,
    text,
    createdAt: isTime(createdAt) ? createdAt : updatedAt,
    updatedAt,
  };
  if (isTime(lastOpenedAt)) rec.lastOpenedAt = lastOpenedAt;
  return rec;
}

function cleanTitle(title: string | undefined): string {
  const t = (title ?? '').trim();
  return t || SCRIPT_STORE_CONFIG.defaultTitle;
}

/**
 * Script library with an in-memory cache. Reads are synchronous from the cache; writes update
 * the cache, persist, then emit `change`. Writes reject if the backend fails.
 */
export class ScriptStore extends Emitter<ScriptStoreEvents> {
  private readonly cache = new Map<string, ScriptRecord>();
  private readonly now: () => number;
  private readonly newId: () => string;

  private constructor(
    private readonly backend: ScriptBackend,
    opts: ScriptStoreOptions,
  ) {
    super();
    this.now = opts.now ?? Date.now;
    this.newId = opts.newId ?? defaultId;
  }

  /** Load everything from `backend` and return a ready store. */
  static async open(backend: ScriptBackend, opts: ScriptStoreOptions = {}): Promise<ScriptStore> {
    const store = new ScriptStore(backend, opts);
    for (const raw of await backend.getAll()) {
      const r = parseRecord(raw);
      if (r) store.cache.set(r.id, r);
    }
    return store;
  }

  /** False when running on the in-memory fallback. */
  get persistent(): boolean {
    return this.backend.persistent;
  }

  /** All scripts in library order (copies). */
  list(): ScriptRecord[] {
    return [...this.cache.values()].map((r) => ({ ...r })).sort(compareForLibrary);
  }

  get(id: string): ScriptRecord | undefined {
    const r = this.cache.get(id);
    return r ? { ...r } : undefined;
  }

  async create(input: { title?: string; text?: string }): Promise<ScriptRecord> {
    const t = this.now();
    const rec: ScriptRecord = {
      id: this.uniqueId(),
      title: cleanTitle(input.title),
      text: input.text ?? '',
      createdAt: t,
      updatedAt: t,
    };
    await this.write([rec]);
    return { ...rec };
  }

  /** Change title and/or text. Bumps `updatedAt` only if something actually changed. */
  async update(id: string, patch: ScriptPatch): Promise<ScriptRecord> {
    const cur = this.require(id);
    const next: ScriptRecord = { ...cur };
    if (patch.title !== undefined) next.title = cleanTitle(patch.title);
    if (patch.text !== undefined) next.text = patch.text;
    if (next.title === cur.title && next.text === cur.text) return { ...cur };
    next.updatedAt = this.now();
    await this.write([next]);
    return { ...next };
  }

  /** Record that a script was opened (affects library order; does not touch `updatedAt`). */
  async markOpened(id: string): Promise<void> {
    await this.write([{ ...this.require(id), lastOpenedAt: this.now() }]);
  }

  async duplicate(id: string): Promise<ScriptRecord> {
    const cur = this.require(id);
    return this.create({ title: cur.title + SCRIPT_STORE_CONFIG.copySuffix, text: cur.text });
  }

  async delete(id: string): Promise<void> {
    if (!this.cache.has(id)) return;
    await this.backend.delete(id);
    this.cache.delete(id);
    this.emitChange();
  }

  /** JSON backup of the whole library. */
  exportAll(): string {
    const backup = {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exportedAt: new Date(this.now()).toISOString(),
      scripts: this.list(),
    };
    return JSON.stringify(backup, null, 2);
  }

  /**
   * Merge a backup produced by `exportAll`. New ids are added; on id collision the record with
   * the newer `updatedAt` wins (ties keep the local copy). Invalid records are skipped.
   * Throws on malformed JSON or a file that isn't a Cadence backup.
   */
  async importBackup(json: string): Promise<ImportResult> {
    let raw: unknown;
    try {
      raw = JSON.parse(json);
    } catch {
      throw new Error('Not a valid backup file (bad JSON).');
    }
    if (!isRec(raw) || raw.format !== BACKUP_FORMAT || !Array.isArray(raw.scripts))
      throw new Error('Not a Cadence backup file.');
    if (typeof raw.version !== 'number' || raw.version > BACKUP_VERSION)
      throw new Error('This backup was made by a newer version of Cadence.');

    const result: ImportResult = { added: 0, updated: 0, skipped: 0 };
    // Dedupe within the file first (newest wins), then merge against the library.
    const incoming = new Map<string, ScriptRecord>();
    for (const item of raw.scripts) {
      const rec = parseRecord(item);
      const prev = rec && incoming.get(rec.id);
      if (!rec || prev) result.skipped++;
      if (rec && (!prev || rec.updatedAt > prev.updatedAt)) incoming.set(rec.id, rec);
    }
    const toWrite: ScriptRecord[] = [];
    for (const rec of incoming.values()) {
      const local = this.cache.get(rec.id);
      if (!local) result.added++;
      else if (rec.updatedAt > local.updatedAt) result.updated++;
      else {
        result.skipped++;
        continue;
      }
      const opened = Math.max(rec.lastOpenedAt ?? 0, local?.lastOpenedAt ?? 0);
      toWrite.push(opened ? { ...rec, lastOpenedAt: opened } : rec);
    }
    if (toWrite.length) await this.write(toWrite);
    return result;
  }

  private require(id: string): ScriptRecord {
    const r = this.cache.get(id);
    if (!r) throw new Error(`Script not found: ${id}`);
    return r;
  }

  private uniqueId(): string {
    let id = this.newId();
    while (this.cache.has(id)) id = defaultId();
    return id;
  }

  private async write(records: ScriptRecord[]): Promise<void> {
    await this.backend.putMany(records);
    for (const r of records) this.cache.set(r.id, r);
    this.emitChange();
  }

  private emitChange(): void {
    this.emit('change', { scripts: this.list() });
  }
}

/** Non-persistent backend used when IndexedDB is unavailable, and in tests. */
export function memoryBackend(initial: ScriptRecord[] = []): ScriptBackend {
  const data = new Map(initial.map((r) => [r.id, structuredClone(r)]));
  return {
    persistent: false,
    getAll: async () => [...data.values()].map((r) => structuredClone(r)),
    putMany: async (rs) => {
      for (const r of rs) data.set(r.id, structuredClone(r));
    },
    delete: async (id) => void data.delete(id),
  };
}

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });
}

/** Open the IndexedDB backend. Rejects if IndexedDB is missing, blocked, or hangs. */
export function openIdbBackend(factory: IDBFactory | undefined): Promise<ScriptBackend> {
  const C = SCRIPT_STORE_CONFIG;
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (!factory) return reject(new Error('IndexedDB unavailable'));
    const timer = setTimeout(() => reject(new Error('IndexedDB open timed out')), C.openTimeoutMs);
    let open: IDBOpenDBRequest;
    try {
      open = factory.open(C.dbName, C.dbVersion);
    } catch (e) {
      clearTimeout(timer);
      return reject(e);
    }
    open.onupgradeneeded = () => {
      if (!open.result.objectStoreNames.contains(C.storeName))
        open.result.createObjectStore(C.storeName, { keyPath: 'id' });
    };
    open.onsuccess = () => {
      clearTimeout(timer);
      resolve(open.result);
    };
    open.onerror = () => {
      clearTimeout(timer);
      reject(open.error);
    };
  }).then((db): ScriptBackend => {
    const store = (mode: IDBTransactionMode) => {
      const tx = db.transaction(C.storeName, mode);
      return { tx, os: tx.objectStore(C.storeName) };
    };
    return {
      persistent: true,
      getAll: () => req(store('readonly').os.getAll() as IDBRequest<ScriptRecord[]>),
      putMany: (rs) => {
        const { tx, os } = store('readwrite');
        for (const r of rs) os.put(r);
        return txDone(tx);
      },
      delete: (id) => {
        const { tx, os } = store('readwrite');
        os.delete(id);
        return txDone(tx);
      },
    };
  });
}

/** IndexedDB-backed store, or an in-memory one (with `persistent === false`) if that fails. */
export async function openScriptStore(
  factory: IDBFactory | undefined,
  opts: ScriptStoreOptions = {},
): Promise<ScriptStore> {
  try {
    return await ScriptStore.open(await openIdbBackend(factory), opts);
  } catch {
    return ScriptStore.open(memoryBackend(), opts);
  }
}
