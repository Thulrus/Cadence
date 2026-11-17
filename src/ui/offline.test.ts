import { describe, expect, it } from 'vitest';
import {
  ModelError,
  MODEL_INFO,
  type DownloadProgress,
  type ModelStore,
} from '../engines/offline/model';
import { memoryStorage, SettingsStore } from '../storage/settings';
import { formatMB, OfflineModelService, offlineReady, type OfflineModelState } from './offline';

function fakeStore(o: { installed?: boolean; fail?: unknown } = {}) {
  let installed = o.installed ?? false;
  const calls: string[] = [];
  const store = {
    info: MODEL_INFO,
    url: 'https://x/models/' + MODEL_INFO.file,
    isInstalled: async () => installed,
    download: async (onProgress: (p: DownloadProgress) => void, signal?: AbortSignal) => {
      calls.push('download');
      onProgress({ loaded: 0, total: 100 });
      onProgress({ loaded: 50, total: 100 });
      await Promise.resolve();
      if (signal?.aborted) throw new ModelError('cancelled', 'aborted');
      if (o.fail) throw o.fail;
      onProgress({ loaded: 100, total: 100 });
      installed = true;
    },
    remove: async () => {
      calls.push('remove');
      installed = false;
    },
    usage: async () => 5e7,
  };
  return { store: store as unknown as ModelStore, calls };
}

const settings = () => new SettingsStore(memoryStorage());

describe('OfflineModelService', () => {
  it('download → progress → ready, setting the installed flag', async () => {
    const s = settings();
    const { store } = fakeStore();
    const svc = new OfflineModelService(store, s);
    const seen: OfflineModelState['kind'][] = [];
    svc.events.on('change', (st) => seen.push(st.kind));
    expect(offlineReady(s, svc)).toBe(false);
    await svc.download();
    expect(seen).toEqual(['downloading', 'downloading', 'downloading', 'installing', 'ready']);
    expect(s.get().engine.offlineModel).toBe(MODEL_INFO.file);
    expect(offlineReady(s, svc)).toBe(true);
  });

  it('cancel returns to absent; failure shows the error', async () => {
    const svc = new OfflineModelService(fakeStore().store, settings());
    const p = svc.download();
    svc.cancel();
    await p;
    expect(svc.state.kind).toBe('absent');
    const bad = new OfflineModelService(
      fakeStore({ fail: new ModelError('damaged', 'integrity') }).store,
      settings(),
    );
    await bad.download();
    expect(bad.state).toEqual({ kind: 'error', message: 'damaged' });
  });

  it('refresh fixes a stale flag both ways', async () => {
    const s = settings();
    s.update({ engine: { offlineModel: MODEL_INFO.file } });
    expect(await new OfflineModelService(fakeStore().store, s).refresh()).toBe(false);
    expect(s.get().engine.offlineModel).toBe('');
    const svc = new OfflineModelService(fakeStore({ installed: true }).store, s);
    expect(await svc.refresh()).toBe(true);
    expect(s.get().engine.offlineModel).toBe(MODEL_INFO.file);
    expect(svc.state.kind).toBe('ready');
  });

  it('a flag for an older model build is not ready', () => {
    const s = settings();
    s.update({ engine: { offlineModel: 'old-model.tar.gz' } });
    expect(offlineReady(s, new OfflineModelService(fakeStore().store, s))).toBe(false);
  });

  it('remove frees the loaded model first and clears the flag', async () => {
    const s = settings();
    const { store, calls } = fakeStore({ installed: true });
    const svc = new OfflineModelService(store, s, () => calls.push('dispose'));
    await svc.refresh();
    await svc.remove();
    expect(calls).toEqual(['dispose', 'remove']);
    expect(svc.state.kind).toBe('absent');
    expect(s.get().engine.offlineModel).toBe('');
  });

  it('without storage it is unavailable', async () => {
    const svc = new OfflineModelService(null, settings());
    expect(svc.state.kind).toBe('unavailable');
    expect(await svc.refresh()).toBe(false);
    expect(svc.modelUrl).toBe(null);
  });
});

describe('formatMB', () => {
  it('one decimal under 10 MB', () => {
    expect(formatMB(2_345_678)).toBe('2.3 MB');
    expect(formatMB(29_300_000)).toBe('29 MB');
  });
});
