import { describe, expect, it } from 'vitest';
import { actionForKey, isTypingTarget } from './keys';

describe('actionForKey', () => {
  it('maps the SPEC §9 keys', () => {
    expect(actionForKey({ key: ' ' })).toBe('toggle-run');
    expect(actionForKey({ key: 'ArrowDown' })).toBe('line-next');
    expect(actionForKey({ key: 'ArrowUp' })).toBe('line-prev');
    expect(actionForKey({ key: 'PageDown' })).toBe('para-next');
    expect(actionForKey({ key: 'PageUp' })).toBe('para-prev');
    expect(actionForKey({ key: 'Home' })).toBe('home');
    expect(actionForKey({ key: '[' })).toBe('font-smaller');
    expect(actionForKey({ key: ']' })).toBe('font-larger');
    expect(actionForKey({ key: 'f' })).toBe('fullscreen');
    expect(actionForKey({ key: 'Escape' })).toBe('show-controls');
  });

  it('maps clicker variants', () => {
    expect(actionForKey({ key: 'ArrowRight' })).toBe('line-next');
    expect(actionForKey({ key: 'ArrowLeft' })).toBe('line-prev');
    expect(actionForKey({ key: 'b' })).toBe('toggle-run');
    expect(actionForKey({ key: '.' })).toBe('toggle-run');
  });

  it('leaves chords and unknown keys alone', () => {
    expect(actionForKey({ key: 'f', ctrlKey: true })).toBeNull();
    expect(actionForKey({ key: ']', metaKey: true })).toBeNull();
    expect(actionForKey({ key: 'ArrowLeft', altKey: true })).toBeNull();
    expect(actionForKey({ key: 'F5' })).toBeNull();
    expect(actionForKey({ key: 'x' })).toBeNull();
  });
});

describe('isTypingTarget', () => {
  it('yields to form controls', () => {
    expect(isTypingTarget({ tagName: 'INPUT' }, 'ArrowUp')).toBe(true);
    expect(isTypingTarget({ tagName: 'textarea' }, 'f')).toBe(true);
    expect(isTypingTarget({ tagName: 'SELECT' }, 'ArrowDown')).toBe(true);
    expect(isTypingTarget({ tagName: 'DIV', isContentEditable: true }, ' ')).toBe(true);
  });

  it('lets a focused button keep Space/Enter but not other keys', () => {
    expect(isTypingTarget({ tagName: 'BUTTON' }, ' ')).toBe(true);
    expect(isTypingTarget({ tagName: 'BUTTON' }, 'PageDown')).toBe(false);
    expect(isTypingTarget({ tagName: 'BODY' }, ' ')).toBe(false);
    expect(isTypingTarget(null, ' ')).toBe(false);
  });
});
