import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Autosaver } from './autosave';

describe('Autosaver', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('debounces bursts into one save', async () => {
    const save = vi.fn(async () => {});
    const a = new Autosaver(save, 500);
    a.schedule();
    await vi.advanceTimersByTimeAsync(300);
    a.schedule();
    await vi.advanceTimersByTimeAsync(300);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(200);
    expect(save).toHaveBeenCalledTimes(1);
    expect(a.pending).toBe(false);
  });

  it('flush saves immediately and only when dirty', async () => {
    const save = vi.fn(async () => {});
    const a = new Autosaver(save, 500);
    await a.flush();
    expect(save).not.toHaveBeenCalled();
    a.schedule();
    await a.flush();
    expect(save).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('never overlaps saves', async () => {
    let running = 0;
    let maxRunning = 0;
    const save = vi.fn(async () => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      await new Promise((r) => setTimeout(r, 100));
      running--;
    });
    const a = new Autosaver(save, 10);
    a.schedule();
    const first = a.flush();
    a.schedule();
    const second = a.flush();
    await vi.advanceTimersByTimeAsync(300);
    await Promise.all([first, second]);
    expect(save).toHaveBeenCalledTimes(2);
    expect(maxRunning).toBe(1);
  });

  it('reports errors and keeps working', async () => {
    const onError = vi.fn();
    const save = vi.fn().mockRejectedValueOnce(new Error('quota')).mockResolvedValue(undefined);
    const a = new Autosaver(save, 10, onError);
    a.schedule();
    await a.flush();
    expect(onError).toHaveBeenCalledOnce();
    a.schedule();
    await a.flush();
    expect(save).toHaveBeenCalledTimes(2);
  });
});
