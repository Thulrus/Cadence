import { describe, expect, it } from 'vitest';
import { resolveConfig } from '../core/align/config';
import { Emitter } from '../core/emitter';
import { PositionController } from '../core/position/controller';
import { buildScriptIndex } from '../core/text/index';
import { normalizeText } from '../core/text/normalize';
import { parseScript } from '../core/text/parse';
import type { RecognizerEngine, RecognizerEngineEvents } from '../core/types';
import {
  jumpMessage,
  linesBetween,
  statusAnnouncement,
  statusBadge,
  TimingStats,
  VoiceFollowSession,
} from './follow';

const PARA = (n: number) =>
  `Paragraph ${n} talks about the garden behind house number ${n}. ` +
  `Tomatoes and beans grew tall beside the fence while the neighbors watched. ` +
  `Every evening someone carried water from the old pump to the thirsty rows.`;
const TEXT = Array.from({ length: 8 }, (_, i) => PARA(i + 1)).join('\n\n');

class FakeEngine implements RecognizerEngine {
  readonly id = 'simulated' as const;
  readonly events = new Emitter<RecognizerEngineEvents>();
  started = 0;
  stopped = 0;
  t = 0;
  async start() {
    this.started++;
    this.events.emit('status', { status: 'listening' });
  }
  stop() {
    this.stopped++;
  }
  /** One utterance: interim per word, then final. */
  say(text: string) {
    const words = text.split(/\s+/).filter(Boolean);
    words.forEach((_, i) => {
      this.t += 400;
      this.events.emit('result', {
        words: words.slice(0, i + 1),
        isFinal: false,
        timestamp: this.t,
      });
    });
    this.t += 300;
    this.events.emit('result', { words, isFinal: true, timestamp: this.t });
  }
}

function setup(config = {}) {
  const index = buildScriptIndex(parseScript(TEXT));
  const ctl = new PositionController(index);
  const engine = new FakeEngine();
  const session = new VoiceFollowSession(engine, index, ctl, resolveConfig(config), () => 0);
  const norms = index.tokens.map((t) => t.norm);
  const after = (phrase: string, from = 0) => {
    const ph = normalizeText(phrase);
    for (let i = from; i + ph.length <= norms.length; i++) {
      if (ph.every((t, k) => norms[i + k] === t)) return i + ph.length;
    }
    throw new Error(phrase);
  };
  const changes: string[] = [];
  ctl.events.on('change', (c) => changes.push(c.source));
  return { index, ctl, engine, session, after, changes };
}

describe('VoiceFollowSession', () => {
  it('moves the controller with source align as speech is recognized', () => {
    const { ctl, engine, after, changes } = setup();
    engine.say('Paragraph one talks about the garden behind house number one');
    expect(ctl.position).toBe(after('Paragraph 1 talks about the garden behind house number 1'));
    expect(changes.every((s) => s === 'align')).toBe(true);
  });

  it('keeps tracking while detached (position moves, following stays off)', () => {
    const { ctl, engine, after } = setup();
    ctl.detach();
    engine.say('Paragraph one talks about the garden behind house number one');
    expect(ctl.following).toBe(false);
    expect(ctl.position).toBe(after('Paragraph 1 talks about the garden behind house number 1'));
  });

  it('a manual change re-centres the aligner', () => {
    const { ctl, engine, session, after } = setup();
    const p5 = after('Paragraph 5');
    ctl.set(p5, 'manual');
    expect(session.aligner.state.position).toBe(p5);
    engine.say('talks about the garden behind house number five');
    expect(ctl.position).toBe(after('talks about the garden behind house number 5', p5 - 2));
  });

  it('emits jump for a large skip and undo goes back and resyncs', () => {
    const { ctl, engine, session, after } = setup({ largeJumpTokens: 10, maxSkipAhead: 1000 });
    const jumps: number[] = [];
    session.events.on('jump', (j) => jumps.push(j.position - j.previous));
    engine.say('Paragraph one talks about the garden behind house number one');
    const before = ctl.position;
    engine.say('Paragraph two talks about the garden behind house number two');
    expect(ctl.position).toBe(after('Paragraph 2 talks about the garden behind house number 2'));
    expect(jumps.length).toBe(1);
    expect(jumps[0]).toBeGreaterThan(10);
    session.undoJump();
    expect(ctl.position).toBe(before);
    expect(session.aligner.state.position).toBe(before);
  });

  it('reports lost and clears it on resync', () => {
    const { engine, session } = setup();
    const lost: boolean[] = [];
    session.events.on('lost', (l) => lost.push(l.lost));
    for (let k = 0; k < 10; k++) engine.say('completely unrelated words about cars and trucks');
    expect(session.isLost).toBe(true);
    session.resync();
    expect(lost).toEqual([true, false]);
  });

  it('forwards status, times each result, and stops the engine on destroy', async () => {
    const { engine, session } = setup();
    const statuses: string[] = [];
    let timed = 0;
    session.events.on('status', (s) => statuses.push(s.status));
    session.events.on('timing', () => timed++);
    await session.start();
    engine.say('hello there');
    expect(statuses).toEqual(['listening']);
    expect(timed).toBe(3);
    session.destroy();
    expect(engine.stopped).toBe(1);
    engine.say('Paragraph one talks about the garden');
    expect(timed).toBe(3);
  });
});

describe('helpers', () => {
  it('linesBetween counts line starts crossed', () => {
    expect(linesBetween([0, 10, 20, 30], 5, 25)).toBe(2);
    expect(linesBetween([0, 10, 20, 30], 25, 5)).toBe(2);
    expect(linesBetween([0, 10, 20], 10, 10)).toBe(0);
  });

  it('jumpMessage', () => {
    expect(jumpMessage(1, true)).toBe('Jumped ahead 1 line');
    expect(jumpMessage(7, false)).toBe('Jumped back 7 lines');
    expect(jumpMessage(0, true)).toBe('Jumped ahead 1 line');
  });

  it('TimingStats summarizes every n samples', () => {
    const t = new TimingStats(3);
    expect(t.add(1)).toBeNull();
    expect(t.add(2)).toBeNull();
    expect(t.add(6)).toEqual({ n: 3, mean: 3, max: 6 });
    expect(t.add(1)).toBeNull();
  });
});

describe('statusBadge', () => {
  it('maps engine status and lost flag to the badge', () => {
    expect(statusBadge('listening', false)).toEqual({
      label: 'Listening',
      state: 'listening',
      active: true,
    });
    expect(statusBadge('listening', true).label).toBe('Lost');
    expect(statusBadge('restarting', true)).toMatchObject({
      label: 'Recognizer restarting',
      active: true,
    });
    expect(statusBadge('paused', true)).toMatchObject({ label: 'Paused', active: false });
    expect(statusBadge('idle', false).label).toBe('Paused');
    expect(statusBadge('no-permission', false)).toMatchObject({
      label: 'No mic permission',
      active: false,
    });
    expect(statusBadge('error', false, 'No microphone available').label).toBe(
      'No microphone available',
    );
  });
});

describe('VoiceFollowSession failure handling', () => {
  it('turns an engine start rejection into failed + error status', async () => {
    const { engine, session } = setup();
    engine.start = async () => {
      throw new Error('mic exploded');
    };
    const failed: string[] = [];
    const statuses: string[] = [];
    session.events.on('failed', (f) => failed.push(f.message));
    session.events.on('status', (s) => statuses.push(s.status));
    await expect(session.start()).resolves.toBeUndefined();
    expect(failed).toEqual(['mic exploded']);
    expect(statuses).toContain('error');
  });

  it('stops the engine when handling a result throws, without propagating', () => {
    const { engine, session } = setup();
    session.aligner.feed = () => {
      throw new Error('bad state');
    };
    const failed: string[] = [];
    session.events.on('failed', (f) => failed.push(f.message));
    expect(() => engine.say('paragraph one talks')).not.toThrow();
    expect(failed).toEqual(['bad state']);
    expect(engine.stopped).toBeGreaterThan(0);
  });
});

describe('statusAnnouncement', () => {
  it('announces real changes once and stays quiet through recognizer restarts', () => {
    const seq = [
      statusBadge('listening', false),
      statusBadge('restarting', false),
      statusBadge('listening', false),
      statusBadge('listening', true),
      statusBadge('listening', false),
      statusBadge('paused', false),
    ];
    let last: string | null = null;
    const spoken: string[] = [];
    for (const b of seq) {
      const a = statusAnnouncement(last, b);
      if (a) spoken.push((last = a));
    }
    expect(spoken).toEqual(['Listening', 'Lost. Tap a word to resync.', 'Listening', 'Paused']);
  });
});
