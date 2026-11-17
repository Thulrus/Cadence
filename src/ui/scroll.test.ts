import { describe, expect, it } from 'vitest';
import {
  GESTURE_CONFIG,
  SCROLL_CONFIG,
  classifyGesture,
  easeStep,
  planScroll,
  type ScrollPlan,
  type Viewport,
} from './scroll';

const vp: Viewport = { height: 1000, readingPct: 30, maxScroll: 10_000 };
const fwd = { backward: false, force: false };
const line = (top: number) => ({ top, height: 80 });

describe('easeStep', () => {
  it('moves toward the target without overshooting', () => {
    let x = 0;
    let prev = 0;
    for (let i = 0; i < 20; i++) {
      x = easeStep(x, 500, 16);
      expect(x).toBeGreaterThanOrEqual(prev);
      expect(x).toBeLessThanOrEqual(500);
      prev = x;
    }
    expect(x).toBeGreaterThan(400);
  });

  it('settles exactly on the target', () => {
    let x = 0;
    for (let i = 0; i < 200 && x !== 500; i++) x = easeStep(x, 500, 16);
    expect(x).toBe(500);
    expect(easeStep(499.8, 500, 16)).toBe(500);
  });

  it('works backward and clamps huge frame gaps', () => {
    expect(easeStep(500, 0, 16)).toBeLessThan(500);
    const capped = easeStep(0, 1000, SCROLL_CONFIG.maxFrameMs);
    expect(easeStep(0, 1000, 10_000)).toBe(capped);
    expect(easeStep(0, 1000, -5)).toBe(0);
  });
});

describe('planScroll', () => {
  it('centres the line on the reading line, clamped to the scroll range', () => {
    expect(planScroll(null, line(2000), vp, fwd).target).toBe(2000 + 40 - 300);
    expect(planScroll(null, line(10), vp, fwd).target).toBe(0);
    expect(planScroll(null, line(99_999), vp, fwd).target).toBe(10_000);
  });

  it('deadband: same line keeps the previous plan (no per-word movement)', () => {
    const p1 = planScroll(null, line(2000), vp, fwd);
    const p2 = planScroll(p1, line(2000 + SCROLL_CONFIG.lineEpsilonPx), vp, fwd);
    expect(p2).toBe(p1);
  });

  it('a new line moves the target', () => {
    const p1 = planScroll(null, line(2000), vp, fwd);
    const p2 = planScroll(p1, line(2080), vp, fwd);
    expect(p2.target).toBe(p1.target + 80);
  });

  it('never scrolls backward on forward-only changes', () => {
    const p1: ScrollPlan = { target: 1740, lineTop: 2000 };
    const p2 = planScroll(p1, line(1920), vp, fwd);
    expect(p2.target).toBe(1740);
    expect(p2.lineTop).toBe(1920);
  });

  it('scrolls backward when the position genuinely moved back, or when forced', () => {
    const p1: ScrollPlan = { target: 1740, lineTop: 2000 };
    expect(planScroll(p1, line(1000), vp, { backward: true, force: false }).target).toBe(740);
    expect(planScroll(p1, line(1000), vp, { backward: false, force: true }).target).toBe(740);
  });

  it('force recomputes even on the same line (e.g. reading line changed)', () => {
    const p1 = planScroll(null, line(2000), vp, fwd);
    const p2 = planScroll(p1, line(2000), { ...vp, readingPct: 50 }, { ...fwd, force: true });
    expect(p2.target).toBe(2000 + 40 - 500);
  });
});

describe('classifyGesture', () => {
  it('short still press is a tap', () => {
    expect(classifyGesture(0, 100)).toBe('tap');
    expect(classifyGesture(GESTURE_CONFIG.tapMaxMovePx, GESTURE_CONFIG.tapMaxMs)).toBe('tap');
  });
  it('movement is a drag regardless of time', () => {
    expect(classifyGesture(GESTURE_CONFIG.tapMaxMovePx + 1, 50)).toBe('drag');
  });
  it('a long still press is neither', () => {
    expect(classifyGesture(2, GESTURE_CONFIG.tapMaxMs + 1)).toBe('none');
  });
});
