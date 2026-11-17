import { describe, expect, it, vi } from 'vitest';
import { Emitter } from './emitter';

describe('Emitter', () => {
  it('delivers payloads to subscribers and supports unsubscribe', () => {
    const e = new Emitter<{ ping: number }>();
    const fn = vi.fn();
    const off = e.on('ping', fn);
    e.emit('ping', 1);
    off();
    e.emit('ping', 2);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(1);
  });
});
