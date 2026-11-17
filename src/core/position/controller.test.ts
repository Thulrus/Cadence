import { describe, expect, it } from 'vitest';
import { buildScriptIndex } from '../text/index';
import { parseScript } from '../text/parse';
import type { PositionChange } from '../types';
import { POSITION_CONFIG, PositionController, paragraphStarts, stepBoundary } from './controller';

const SCRIPT = [
  '# Welcome',
  '',
  'one two three four five',
  '',
  '[pause] six seven eight',
  '',
  'nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen',
].join('\n');

function setup() {
  const index = buildScriptIndex(parseScript(SCRIPT));
  const ctl = new PositionController(index);
  const changes: PositionChange[] = [];
  const follows: boolean[] = [];
  ctl.events.on('change', (c) => changes.push(c));
  ctl.events.on('follow', (f) => follows.push(f.following));
  return { index, ctl, changes, follows };
}

describe('paragraphStarts', () => {
  it('lists the first token of each block that has spoken tokens', () => {
    const { index } = setup();
    // heading has no tokens; paragraph 2 starts at "six" (direction skipped)
    expect(paragraphStarts(index)).toEqual([0, 5, 8]);
  });
});

describe('stepBoundary', () => {
  const starts = [0, 5, 8];
  it('moves forward and back between boundaries', () => {
    expect(stepBoundary(starts, 0, 1, 18)).toBe(5);
    expect(stepBoundary(starts, 6, 1, 18)).toBe(8);
    expect(stepBoundary(starts, 6, -1, 18)).toBe(0);
    expect(stepBoundary(starts, 5, -1, 18)).toBe(0);
  });
  it('clamps to start and end', () => {
    expect(stepBoundary(starts, 8, 1, 18)).toBe(18);
    expect(stepBoundary(starts, 2, -3, 18)).toBe(0);
    expect(stepBoundary([], 3, 1, 18)).toBe(3);
  });
});

describe('PositionController', () => {
  it('starts at 0, following', () => {
    const { ctl } = setup();
    expect(ctl.position).toBe(0);
    expect(ctl.following).toBe(true);
    expect(ctl.length).toBe(18);
  });

  it('clamps and emits change with previous and source', () => {
    const { ctl, changes } = setup();
    ctl.set(3, 'align');
    ctl.set(999, 'manual');
    ctl.set(-5, 'manual');
    expect(changes).toEqual([
      { position: 3, previous: 0, source: 'align' },
      { position: 18, previous: 3, source: 'manual' },
      { position: 0, previous: 18, source: 'manual' },
    ]);
  });

  it('does not emit when the position is unchanged', () => {
    const { ctl, changes } = setup();
    ctl.set(0, 'manual');
    ctl.set(2.7, 'align');
    ctl.set(2, 'align');
    expect(changes).toHaveLength(1);
    expect(ctl.position).toBe(2);
  });

  it('nudges by paragraph', () => {
    const { ctl } = setup();
    ctl.nudgeParagraphs(1);
    expect(ctl.position).toBe(5);
    ctl.nudgeParagraphs(1);
    expect(ctl.position).toBe(8);
    ctl.nudgeParagraphs(-2);
    expect(ctl.position).toBe(0);
  });

  it('nudges by line using the injected provider, else by paragraph', () => {
    const { ctl } = setup();
    ctl.nudgeLines(1);
    expect(ctl.position).toBe(5);
    ctl.setLineStarts(() => [0, 3, 5, 8, 12]);
    ctl.nudgeLines(1);
    expect(ctl.position).toBe(8);
    ctl.nudgeLines(1);
    expect(ctl.position).toBe(12);
    ctl.nudgeLines(-2);
    expect(ctl.position).toBe(5);
  });

  it('undo reverts the last large jump, and undo again swaps back', () => {
    const { ctl } = setup();
    ctl.set(2, 'align'); // small: not undoable
    expect(ctl.canUndo).toBe(false);
    ctl.set(2 + POSITION_CONFIG.undoJumpTokens, 'manual');
    expect(ctl.canUndo).toBe(true);
    ctl.set(15, 'align'); // small move after the jump keeps the undo target
    ctl.undo();
    expect(ctl.position).toBe(2);
    ctl.undo();
    expect(ctl.position).toBe(15);
  });

  it('undo is a no-op with nothing to undo', () => {
    const { ctl, changes } = setup();
    ctl.undo();
    expect(changes).toHaveLength(0);
  });

  it('detach/attach emit follow events only on change', () => {
    const { ctl, follows } = setup();
    ctl.attach();
    ctl.detach();
    ctl.detach();
    expect(ctl.following).toBe(false);
    ctl.attach();
    expect(follows).toEqual([false, true]);
  });

  it('reset returns to 0 and re-attaches', () => {
    const { ctl, changes, follows } = setup();
    ctl.set(7, 'align');
    ctl.detach();
    ctl.reset();
    expect(ctl.position).toBe(0);
    expect(ctl.following).toBe(true);
    expect(changes.at(-1)).toEqual({ position: 0, previous: 7, source: 'reset' });
    expect(follows).toEqual([false, true]);
  });
});
