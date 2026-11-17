import { describe, expect, it } from 'vitest';
import { parseRoute, routeHash } from './router';

describe('parseRoute', () => {
  it('parses the four routes', () => {
    expect(parseRoute('#/library')).toEqual({ name: 'library' });
    expect(parseRoute('#/settings')).toEqual({ name: 'settings' });
    expect(parseRoute('#/editor/abc')).toEqual({ name: 'editor', id: 'abc' });
    expect(parseRoute('#/prompter/a%20b')).toEqual({ name: 'prompter', id: 'a b' });
  });

  it('allows editor without an id (new script)', () => {
    expect(parseRoute('#/editor')).toEqual({ name: 'editor' });
  });

  it('falls back to library for empty, unknown or malformed hashes', () => {
    expect(parseRoute('')).toEqual({ name: 'library' });
    expect(parseRoute('#/')).toEqual({ name: 'library' });
    expect(parseRoute('#/nope')).toEqual({ name: 'library' });
    expect(parseRoute('#/prompter/%E0%A4%A')).toEqual({ name: 'library' });
  });

  it('round-trips with routeHash', () => {
    const r = { name: 'prompter', id: 'x/y z' } as const;
    expect(parseRoute(routeHash(r))).toEqual(r);
  });
});
