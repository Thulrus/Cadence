/**
 * App-level owner of the on-device model: download state (shared by Settings and the
 * prompter, and surviving navigation between them), the `engine.offlineModel` settings flag,
 * and deletion. Wraps ModelStore (engines/offline/model.ts).
 */
import { Emitter } from '../core/emitter';
import { ModelError, type DownloadProgress, type ModelStore } from '../engines/offline/model';
import type { SettingsStore } from '../storage/settings';

export type OfflineModelState =
  | { kind: 'checking' }
  | { kind: 'unavailable' }
  | { kind: 'absent' }
  | { kind: 'downloading'; loaded: number; total: number }
  | { kind: 'installing' }
  | { kind: 'ready' }
  | { kind: 'error'; message: string };

export class OfflineModelService {
  readonly events = new Emitter<{ change: OfflineModelState }>();
  private current: OfflineModelState;
  private abort: AbortController | null = null;

  /** `store` is null when IndexedDB is unavailable (private mode, blocked storage). */
  constructor(
    private readonly store: ModelStore | null,
    private readonly settings: SettingsStore,
    /** Frees the loaded recognizer model before deletion (disposeVoskModel). */
    private readonly dispose: () => void = () => {},
    /** Loads the recognizer runtime alongside the model (warmVoskRuntime). */
    private readonly warm: () => Promise<void> = async () => {},
  ) {
    this.current = store ? { kind: 'checking' } : { kind: 'unavailable' };
  }

  get state(): OfflineModelState {
    return this.current;
  }

  get info() {
    return this.store?.info ?? null;
  }

  get modelUrl(): string | null {
    return this.store?.url ?? null;
  }

  /** Re-read storage; fixes a stale settings flag. Safe to call often. */
  async refresh(): Promise<boolean> {
    if (!this.store) return false;
    if (this.current.kind === 'downloading' || this.current.kind === 'installing') return false;
    let ok = false;
    try {
      ok = await this.store.isInstalled();
    } catch (e) {
      console.info('[cadence] model storage check failed:', e);
    }
    this.setFlag(ok);
    this.set(ok ? { kind: 'ready' } : { kind: 'absent' });
    return ok;
  }

  async download(): Promise<void> {
    if (!this.store || this.abort) return;
    const abort = new AbortController();
    this.abort = abort;
    this.set({ kind: 'downloading', loaded: 0, total: this.store.info.downloadBytes });
    try {
      await Promise.all([
        this.store.download((p: DownloadProgress) => {
          if (this.abort !== abort) return;
          if (p.loaded >= p.total) this.set({ kind: 'installing' });
          else this.set({ kind: 'downloading', ...p });
        }, abort.signal),
        this.warm(),
      ]);
      this.setFlag(true);
      this.set({ kind: 'ready' });
    } catch (e) {
      const aborted = e instanceof ModelError && e.kind === 'aborted';
      if (!aborted) console.error('[cadence] model download failed:', e);
      this.set(
        aborted
          ? { kind: 'absent' }
          : { kind: 'error', message: e instanceof Error ? e.message : String(e) },
      );
    } finally {
      if (this.abort === abort) this.abort = null;
    }
  }

  cancel(): void {
    this.abort?.abort();
  }

  async remove(): Promise<void> {
    if (!this.store) return;
    this.cancel();
    this.dispose();
    try {
      await this.store.remove();
      this.setFlag(false);
      this.set({ kind: 'absent' });
    } catch (e) {
      this.set({ kind: 'error', message: `Couldn’t delete the model: ${String(e)}` });
    }
  }

  usage(): Promise<number | undefined> {
    return this.store ? this.store.usage() : Promise.resolve(undefined);
  }

  private setFlag(installed: boolean): void {
    const file = installed && this.store ? this.store.info.file : '';
    if (this.settings.get().engine.offlineModel !== file) {
      this.settings.update({ engine: { offlineModel: file } });
    }
  }

  private set(s: OfflineModelState): void {
    this.current = s;
    this.events.emit('change', s);
  }
}

/** Whether settings say the current model build is installed. */
export function offlineReady(
  settings: SettingsStore,
  svc: OfflineModelService | undefined,
): boolean {
  const info = svc?.info;
  return !!info && settings.get().engine.offlineModel === info.file;
}

/** "12.3 MB" style sizes for the UI. */
export function formatMB(bytes: number): string {
  const MB = 1e6;
  return `${(bytes / MB).toFixed(bytes < 10 * MB ? 1 : 0)} MB`;
}

/**
 * Whether to promote the on-device model: it can run here, isn't installed, the user hasn't
 * explicitly chosen the browser service, and the language is one the model handles (English).
 * People who never open Settings otherwise only ever meet the laggier browser service.
 */
export function shouldOfferOffline(
  settings: SettingsStore,
  svc: OfflineModelService | undefined,
  capable: boolean,
): boolean {
  if (!svc || !capable || offlineReady(settings, svc)) return false;
  // Only once storage has been checked: 'checking' has nothing to act on yet.
  const st = svc.state.kind;
  if (st === 'checking' || st === 'unavailable' || st === 'ready') return false;
  const { choice, lang } = settings.get().engine;
  return choice !== 'webspeech' && /^en\b/i.test(lang);
}
