import { describe, expect, it } from 'vitest';
import { updateBannerVisible } from './update';

describe('updateBannerVisible', () => {
  it('is hidden until an update is waiting', () => {
    expect(updateBannerVisible(false, false, 'library')).toBe(false);
    expect(updateBannerVisible(true, false, 'library')).toBe(true);
  });
  it('is held back while prompting', () => {
    expect(updateBannerVisible(true, false, 'prompter')).toBe(false);
    expect(updateBannerVisible(true, false, 'settings')).toBe(true);
    expect(updateBannerVisible(true, false, undefined)).toBe(true);
  });
  it('stays hidden after Later', () => {
    expect(updateBannerVisible(true, true, 'library')).toBe(false);
  });
});
