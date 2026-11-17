/**
 * On-device model management (docs/decisions/0001-offline-asr.md).
 *
 * The model archive is built by `scripts/build-model.mjs` and served from this site
 * (`models/`), never a third party. Download flow:
 *   1. fetch `models/<id>.json` (size + SHA-256), then the archive with progress and cancel;
 *   2. verify size and hash;
 *   3. ask for persistent storage (`navigator.storage.persist()`), so the browser doesn't
 *      evict ~45 MB under storage pressure;
 *   4. write the archive into the IndexedDB file system that `vosk-browser` reads (Emscripten
 *      IDBFS, database `/vosk`), exactly where its own downloader would have put it, plus its
 *      "downloaded" marker. On first model load Vosk unpacks it there and deletes the archive,
 *      so only the unpacked model stays on disk. No second copy in Cache Storage.
 *
 * vosk-browser is pinned (0.0.8, unmaintained since 2022), so its IDBFS layout is stable;
 * `VOSK_IDBFS` mirrors it and model.test.ts pins it.
 */

export interface ModelInfo {
  /** Archive file name under `models/` (also names the manifest). */
  file: string;
  manifest: string;
  /** Approximate sizes for the UI before the manifest is fetched. */
  downloadBytes: number;
  diskBytes: number;
  /** BCP-47 language prefix the model understands. */
  lang: string;
}

/** Keep `file` in sync with OUT_NAME + ARCHIVE_EXT in scripts/build-model.mjs. */
export const MODEL_INFO: Readonly<ModelInfo> = {
  // `.bin`, not `.gz`: see ARCHIVE_EXT in the build script.
  file: 'vosk-small-en-us-0.15-lite.tar.gz.bin',
  manifest: 'vosk-small-en-us-0.15-lite.json',
  downloadBytes: 29_300_000,
  diskBytes: 46_000_000,
  lang: 'en',
};

/** vosk-browser 0.0.8's persistent file system (Emscripten IDBFS). */
export const VOSK_IDBFS = {
  db: '/vosk',
  version: 21,
  store: 'FILE_DATA',
  index: 'timestamp',
  dirMode: 0o40777,
  fileMode: 0o100666,
  archive: 'downloaded.tar.gz',
  downloadedMarker: 'downloaded.ok',
  extractedMarker: 'extracted.ok',
} as const;

/** Where vosk-browser keeps a model, given the exact URL string passed to `new Model(url)`. */
export function voskModelPath(url: string): string {
  return `${VOSK_IDBFS.db}/${url.replace(/[\W]/g, '_')}`;
}

export interface ModelManifest {
  file: string;
  bytes: number;
  sha256: string;
}

export interface DownloadProgress {
  loaded: number;
  total: number;
}

export interface ModelStoreDeps {
  /** Absolute URL of the `models/` directory (ends with `/`). */
  baseUrl: string;
  fetch: typeof fetch;
  indexedDB: IDBFactory;
  /** Defaults to the global; tests pass fake-indexeddb's. */
  keyRange?: typeof IDBKeyRange;
  subtle: SubtleCrypto;
  storage?: Pick<StorageManager, 'persist' | 'estimate'>;
  info?: Readonly<ModelInfo>;
}

export class ModelError extends Error {
  constructor(
    message: string,
    readonly kind: 'network' | 'integrity' | 'storage' | 'missing' | 'aborted',
  ) {
    super(message);
    this.name = 'ModelError';
  }
}

export const MODEL_MESSAGES = {
  missing: 'The on-device speech model isn’t available on this site build.',
  network: 'Couldn’t download the speech model. Check your connection and try again.',
  integrity: 'The downloaded speech model was damaged. Please try again.',
  storage: 'Couldn’t save the speech model. Free up some space on this device and try again.',
  aborted: 'Download cancelled.',
} as const;

export class ModelStore {
  readonly info: Readonly<ModelInfo>;
  /** The URL handed to vosk-browser; also the key of its IDBFS directory. */
  readonly url: string;
  private db: Promise<IDBDatabase> | null = null;

  constructor(private readonly deps: ModelStoreDeps) {
    this.info = deps.info ?? MODEL_INFO;
    this.url = new URL(this.info.file, deps.baseUrl).href;
  }

  /** IDBFS directory of this model. */
  get path(): string {
    return voskModelPath(this.url);
  }

  /** Downloaded (and possibly already unpacked by Vosk). */
  async isInstalled(): Promise<boolean> {
    const db = await this.open();
    const tx = db.transaction(VOSK_IDBFS.store, 'readonly');
    const store = tx.objectStore(VOSK_IDBFS.store);
    const has = (key: string) => request(store.count(`${this.path}/${key}`)).then((n) => n > 0);
    const [extracted, downloaded] = await Promise.all([
      has(VOSK_IDBFS.extractedMarker),
      has(VOSK_IDBFS.downloadedMarker),
    ]);
    return extracted || downloaded;
  }

  /** Download, verify and install. Rejects with ModelError. */
  async download(
    onProgress: (p: DownloadProgress) => void = () => {},
    signal?: AbortSignal,
  ): Promise<void> {
    const manifest = await this.fetchManifest(signal);
    const bytes = await this.fetchArchive(manifest, onProgress, signal);
    const hash = hex(await this.deps.subtle.digest('SHA-256', bytes));
    if (bytes.byteLength !== manifest.bytes || hash !== manifest.sha256) {
      throw new ModelError(MODEL_MESSAGES.integrity, 'integrity');
    }
    signal?.throwIfAborted?.();
    try {
      await this.deps.storage?.persist();
    } catch {
      // Best effort: without persistence the browser may evict it under pressure.
    }
    try {
      await this.seed(bytes);
    } catch (e) {
      throw new ModelError(`${MODEL_MESSAGES.storage} (${String(e)})`, 'storage');
    }
  }

  /** Delete the model (archive and unpacked files). Free the loaded model first. */
  async remove(): Promise<void> {
    const db = await this.open();
    const tx = db.transaction(VOSK_IDBFS.store, 'readwrite');
    tx.objectStore(VOSK_IDBFS.store).delete(this.range());
    await done(tx);
  }

  /** Storage this site uses on the device (bytes), if the browser reports it. */
  async usage(): Promise<number | undefined> {
    try {
      return (await this.deps.storage?.estimate())?.usage;
    } catch {
      return undefined;
    }
  }

  close(): void {
    void this.db?.then((d) => d.close()).catch(() => {});
    this.db = null;
  }

  private async fetchManifest(signal?: AbortSignal): Promise<ModelManifest> {
    const res = await this.get(new URL(this.info.manifest, this.deps.baseUrl).href, signal);
    let m: unknown;
    try {
      m = await res.json();
    } catch {
      throw new ModelError(MODEL_MESSAGES.missing, 'missing');
    }
    if (!isManifest(m) || m.file !== this.info.file) {
      throw new ModelError(MODEL_MESSAGES.missing, 'missing');
    }
    return m;
  }

  private async fetchArchive(
    manifest: ModelManifest,
    onProgress: (p: DownloadProgress) => void,
    signal?: AbortSignal,
  ): Promise<Uint8Array<ArrayBuffer>> {
    const res = await this.get(this.url, signal);
    const total = manifest.bytes;
    onProgress({ loaded: 0, total });
    if (!res.body) {
      const buf = new Uint8Array(await res.arrayBuffer());
      onProgress({ loaded: buf.byteLength, total });
      return buf;
    }
    const out = new Uint8Array(total);
    const extra: Uint8Array[] = [];
    let loaded = 0;
    const reader = res.body.getReader();
    try {
      for (;;) {
        const { done: end, value } = await reader.read();
        if (end) break;
        if (loaded + value.byteLength <= total) out.set(value, loaded);
        else extra.push(value); // more than the manifest says: fails the size check below
        loaded += value.byteLength;
        onProgress({ loaded: Math.min(loaded, total), total });
      }
    } catch (e) {
      throw signal?.aborted
        ? new ModelError(MODEL_MESSAGES.aborted, 'aborted')
        : new ModelError(MODEL_MESSAGES.network, 'network');
    }
    if (loaded !== total || extra.length) {
      throw new ModelError(MODEL_MESSAGES.integrity, 'integrity');
    }
    return out;
  }

  private async get(url: string, signal?: AbortSignal): Promise<Response> {
    let res: Response;
    try {
      // `no-cache`: revalidate, so a redeployed model isn't mixed with a stale manifest.
      res = await this.deps.fetch(url, { signal, cache: 'no-cache' });
    } catch {
      if (signal?.aborted) throw new ModelError(MODEL_MESSAGES.aborted, 'aborted');
      throw new ModelError(MODEL_MESSAGES.network, 'network');
    }
    if (res.status === 404) throw new ModelError(MODEL_MESSAGES.missing, 'missing');
    if (!res.ok) throw new ModelError(MODEL_MESSAGES.network, 'network');
    return res;
  }

  /** Write the archive where vosk-browser's downloader would have, plus its marker. */
  private async seed(bytes: Uint8Array): Promise<void> {
    const db = await this.open();
    const tx = db.transaction(VOSK_IDBFS.store, 'readwrite');
    const store = tx.objectStore(VOSK_IDBFS.store);
    const timestamp = new Date();
    store.delete(this.range());
    store.put({ timestamp, mode: VOSK_IDBFS.dirMode }, this.path);
    store.put(
      { timestamp, mode: VOSK_IDBFS.fileMode, contents: bytes },
      `${this.path}/${VOSK_IDBFS.archive}`,
    );
    store.put(
      { timestamp, mode: VOSK_IDBFS.fileMode, contents: new Uint8Array(0) },
      `${this.path}/${VOSK_IDBFS.downloadedMarker}`,
    );
    await done(tx);
  }

  /** Every IDBFS key of this model: its directory and everything under it. */
  private range(): IDBKeyRange {
    const KeyRange = this.deps.keyRange ?? IDBKeyRange;
    return KeyRange.bound(this.path, `${this.path}/\uffff`);
  }

  /** Open vosk-browser's database, creating it the way Emscripten IDBFS would. */
  private open(): Promise<IDBDatabase> {
    this.db ??= new Promise<IDBDatabase>((resolve, reject) => {
      const req = this.deps.indexedDB.open(VOSK_IDBFS.db, VOSK_IDBFS.version);
      req.onupgradeneeded = () => {
        const db = req.result;
        const store = db.objectStoreNames.contains(VOSK_IDBFS.store)
          ? req.transaction!.objectStore(VOSK_IDBFS.store)
          : db.createObjectStore(VOSK_IDBFS.store);
        if (!store.indexNames.contains(VOSK_IDBFS.index)) {
          store.createIndex(VOSK_IDBFS.index, VOSK_IDBFS.index, { unique: false });
        }
      };
      req.onsuccess = () => {
        // Let the Vosk worker (or a newer tab) upgrade or delete without waiting on us.
        req.result.onversionchange = () => this.close();
        resolve(req.result);
      };
      req.onerror = () => reject(req.error ?? new Error('IndexedDB unavailable'));
      req.onblocked = () => reject(new Error('IndexedDB is blocked by another tab'));
    });
    this.db.catch(() => (this.db = null));
    return this.db;
  }
}

function isManifest(m: unknown): m is ModelManifest {
  const r = m as Partial<ModelManifest> | null;
  return (
    !!r &&
    typeof r.file === 'string' &&
    typeof r.bytes === 'number' &&
    r.bytes > 0 &&
    typeof r.sha256 === 'string' &&
    /^[0-9a-f]{64}$/.test(r.sha256)
  );
}

function hex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'));
  });
}
