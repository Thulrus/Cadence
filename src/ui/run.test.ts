import { describe, expect, it } from 'vitest';
import type { RunMode } from '../storage/settings';
import { canAutoHide, nearEdge, RunController, type RunDriver } from './run';

function setup(mode: RunMode = 'timed') {
  let t = 0;
  const log: string[] = [];
  const drv = (name: RunMode, deferred = false): RunDriver => ({
    deferred,
    start: () => log.push(`${name}:start`),
    stop: () => log.push(`${name}:stop`),
  });
  const run = new RunController(
    mode,
    { voice: drv('voice', true), timed: drv('timed'), manual: drv('manual') },
    () => t,
  );
  return { run, log, at: (ms: number) => (t = ms) };
}

describe('RunController', () => {
  it('timed/manual activate immediately; the clock counts only while active', () => {
    const { run, log, at } = setup('timed');
    run.toggle();
    expect(run.active).toBe(true);
    at(5000);
    run.toggle();
    expect(run.active).toBe(false);
    at(9000);
    expect(run.elapsed()).toBe(5000);
    expect(log).toEqual(['timed:start', 'timed:stop']);
  });

  it('voice waits for the engine to report activity', () => {
    const { run, at } = setup('voice');
    run.resume();
    expect(run.active).toBe(false);
    expect(run.started).toBe(false);
    run.driverActive('voice', true);
    expect(run.active).toBe(true);
    at(3000);
    run.driverActive('voice', false); // e.g. mic denied / error
    expect(run.active).toBe(false);
    expect(run.elapsed()).toBe(3000);
  });

  it('switching mode while active stops the old driver and starts the new one', () => {
    const { run, log, at } = setup('timed');
    run.resume();
    at(1000);
    run.setMode('manual');
    expect(run.active).toBe(true);
    expect(log).toEqual(['timed:start', 'timed:stop', 'manual:start']);
    at(2000);
    expect(run.elapsed()).toBe(2000); // clock not interrupted
    run.setMode('voice');
    expect(log.slice(-2)).toEqual(['manual:stop', 'voice:start']);
    expect(run.active).toBe(false); // until the engine is listening
    run.driverActive('voice', true);
    expect(run.active).toBe(true);
    run.driverActive('timed', false); // other modes' reports are ignored
    expect(run.active).toBe(true);
  });

  it('switching while paused only changes the mode', () => {
    const { run, log } = setup('voice');
    const modes: string[] = [];
    run.events.on('change', (s) => modes.push(s.mode));
    run.setMode('timed');
    expect(run.active).toBe(false);
    expect(log).toEqual(['voice:stop']);
    expect(modes).toEqual(['timed']);
    run.setMode('timed'); // no-op
    expect(modes).toEqual(['timed']);
  });

  it('a synchronous stop report from the old driver does not break the switch', () => {
    let t = 0;
    const run: RunController = new RunController(
      'voice',
      {
        voice: { deferred: true, start: () => {}, stop: () => run.driverActive('voice', false) },
        timed: { start: () => {}, stop: () => {} },
        manual: { start: () => {}, stop: () => {} },
      },
      () => t,
    );
    run.resume();
    run.driverActive('voice', true);
    t = 1000;
    run.setMode('timed');
    expect(run.active).toBe(true);
    expect(run.mode).toBe('timed');
  });

  it('resetClock zeroes the timer', () => {
    const { run, at } = setup('manual');
    run.resume();
    at(4000);
    run.resetClock();
    at(5000);
    expect(run.elapsed()).toBe(1000);
  });
});

describe('controls helpers', () => {
  it('nearEdge uses a fraction of the height with a px floor', () => {
    expect(nearEdge(10, 1000)).toBe(true);
    expect(nearEdge(149, 1000)).toBe(true);
    expect(nearEdge(500, 1000)).toBe(false);
    expect(nearEdge(900, 1000)).toBe(true);
    expect(nearEdge(60, 300)).toBe(true); // 15% = 45 px < 64 px floor
  });

  it('canAutoHide only during an active run with nothing open', () => {
    const base = { active: true, delayMs: 3000, overlayOpen: false, pointerInControls: false };
    expect(canAutoHide(base)).toBe(true);
    expect(canAutoHide({ ...base, active: false })).toBe(false);
    expect(canAutoHide({ ...base, delayMs: 0 })).toBe(false);
    expect(canAutoHide({ ...base, overlayOpen: true })).toBe(false);
    expect(canAutoHide({ ...base, pointerInControls: true })).toBe(false);
  });
});
