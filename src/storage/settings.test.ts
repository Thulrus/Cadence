import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_SETTINGS,
  SETTINGS_KEY,
  SettingsStore,
  memoryStorage,
  parseSettings,
} from './settings';

const stored = (value: unknown) =>
  memoryStorage({ [SETTINGS_KEY]: typeof value === 'string' ? value : JSON.stringify(value) });

describe('SettingsStore', () => {
  it('starts from defaults with empty storage', () => {
    expect(new SettingsStore(memoryStorage()).get()).toEqual(DEFAULT_SETTINGS);
  });

  it('deep-merges stored values over defaults', () => {
    const s = new SettingsStore(stored({ appearance: { theme: 'light' }, run: { timedWpm: 120 } }));
    const v = s.get();
    expect(v.appearance.theme).toBe('light');
    expect(v.appearance.fontSizePx).toBe(DEFAULT_SETTINGS.appearance.fontSizePx);
    expect(v.run.timedWpm).toBe(120);
    expect(v.run.mode).toBe('voice');
  });

  it('survives corrupt JSON', () => {
    expect(new SettingsStore(stored('{not json')).get()).toEqual(DEFAULT_SETTINGS);
    expect(new SettingsStore(stored('[1,2]')).get()).toEqual(DEFAULT_SETTINGS);
    expect(new SettingsStore(stored('null')).get()).toEqual(DEFAULT_SETTINGS);
  });

  it('ignores invalid field types and enum values per field', () => {
    const v = new SettingsStore(
      stored({
        appearance: { theme: 'neon', fontSizePx: '80', mirrorX: 'yes', lineHeight: 2 },
        run: { mode: 42, targetDurationSec: 'soon' },
        engine: 'webspeech',
        align: { a: 1, b: true, c: 'x', d: null },
      }),
    ).get();
    expect(v.appearance.theme).toBe('dark');
    expect(v.appearance.fontSizePx).toBe(DEFAULT_SETTINGS.appearance.fontSizePx);
    expect(v.appearance.mirrorX).toBe(false);
    expect(v.appearance.lineHeight).toBe(2);
    expect(v.run.mode).toBe('voice');
    expect(v.run.targetDurationSec).toBeNull();
    expect(v.engine).toEqual(DEFAULT_SETTINGS.engine);
    expect(v.align).toEqual({ a: 1, b: true });
  });

  it('clamps out-of-range numbers', () => {
    const v = parseSettings({ appearance: { columnChars: 99, spokenDim: -1 } });
    expect(v.appearance.columnChars).toBe(50);
    expect(v.appearance.spokenDim).toBe(0);
  });

  it('update persists, merges within a group, and emits change', () => {
    const storage = memoryStorage();
    const s = new SettingsStore(storage);
    const listener = vi.fn();
    s.on('change', listener);
    s.update({ appearance: { theme: 'green-on-black' }, run: { targetDurationSec: 600 } });
    expect(s.get().appearance.theme).toBe('green-on-black');
    expect(s.get().appearance.fontSizePx).toBe(DEFAULT_SETTINGS.appearance.fontSizePx);
    expect(listener).toHaveBeenCalledOnce();
    expect(listener.mock.calls[0]![0].groups).toEqual(['appearance', 'run']);
    expect(new SettingsStore(storage).get().run.targetDurationSec).toBe(600);
  });

  it('update ignores invalid values but keeps valid ones', () => {
    const s = new SettingsStore(memoryStorage());
    s.update({ appearance: { theme: 'bogus' as never, fontSizePx: 72 } });
    expect(s.get().appearance.theme).toBe('dark');
    expect(s.get().appearance.fontSizePx).toBe(72);
  });

  it('get returns a copy', () => {
    const s = new SettingsStore(memoryStorage());
    s.get().appearance.theme = 'light';
    expect(s.get().appearance.theme).toBe('dark');
  });

  it('reset restores one group or everything', () => {
    const s = new SettingsStore(memoryStorage());
    s.update({ appearance: { theme: 'light' }, run: { mode: 'manual' } });
    const listener = vi.fn();
    s.on('change', listener);
    s.reset('run');
    expect(s.get().run.mode).toBe('voice');
    expect(s.get().appearance.theme).toBe('light');
    s.reset();
    expect(s.get()).toEqual(DEFAULT_SETTINGS);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('keeps working when storage throws', () => {
    const s = new SettingsStore({
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('full');
      },
    });
    s.update({ appearance: { theme: 'light' } });
    expect(s.get().appearance.theme).toBe('light');
  });
});

describe('engine.micMeter migration', () => {
  const load = (micMeter: unknown) =>
    new SettingsStore(
      memoryStorage({ [SETTINGS_KEY]: JSON.stringify({ engine: { micMeter } }) }),
    ).get().engine.micMeter;
  it('maps the old boolean (true was the default) and validates modes', () => {
    expect(load(true)).toBe('auto');
    expect(load(false)).toBe('off');
    expect(load('on')).toBe('on');
    expect(load('loud')).toBe('auto');
  });
});
