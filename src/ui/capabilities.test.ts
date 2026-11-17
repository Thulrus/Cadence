import { describe, expect, it } from 'vitest';
import {
  CAPABILITY_MESSAGES,
  detectCapabilities,
  resolveEngine,
  type CapabilityEnv,
} from './capabilities';

const CHROME_ANDROID =
  'Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const FIREFOX = 'Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0';
const IPAD =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';

const env = (o: Partial<CapabilityEnv>): CapabilityEnv => ({
  hasSpeechRecognition: true,
  isSecureContext: true,
  hasGetUserMedia: true,
  userAgent: CHROME_ANDROID,
  maxTouchPoints: 5,
  ...o,
});
const prod = { dev: false, forceSim: false };

describe('capabilities', () => {
  it('detects Chrome, Firefox and iPadOS (Mac UA + touch)', () => {
    expect(detectCapabilities(env({}))).toMatchObject({
      webSpeech: true,
      ios: false,
      firefox: false,
    });
    expect(
      detectCapabilities(env({ userAgent: FIREFOX, hasSpeechRecognition: false })),
    ).toMatchObject({
      webSpeech: false,
      firefox: true,
    });
    expect(detectCapabilities(env({ userAgent: IPAD })).ios).toBe(true);
    expect(detectCapabilities(env({ userAgent: IPAD, maxTouchPoints: 0 })).ios).toBe(false);
  });

  it('auto resolves to Web Speech when available', () => {
    expect(resolveEngine('auto', detectCapabilities(env({})), prod)).toEqual({
      engine: 'webspeech',
    });
  });

  it('unsupported → none in production, simulator in dev', () => {
    const caps = detectCapabilities(env({ userAgent: FIREFOX, hasSpeechRecognition: false }));
    expect(resolveEngine('auto', caps, prod)).toEqual({
      engine: 'none',
      note: CAPABILITY_MESSAGES.unsupported,
    });
    expect(resolveEngine('auto', caps, { dev: true, forceSim: false }).engine).toBe('simulated');
  });

  it('insecure context → none with its own message', () => {
    const r = resolveEngine('webspeech', detectCapabilities(env({ isSecureContext: false })), prod);
    expect(r).toEqual({ engine: 'none', note: CAPABILITY_MESSAGES.insecure });
  });

  it('?sim forces the simulator; iOS and offline add notes', () => {
    const caps = detectCapabilities(env({ userAgent: IPAD }));
    expect(resolveEngine('auto', caps, { dev: false, forceSim: true })).toEqual({
      engine: 'simulated',
    });
    expect(resolveEngine('auto', caps, prod).note).toBe(CAPABILITY_MESSAGES.ios);
    expect(resolveEngine('offline', detectCapabilities(env({})), prod)).toEqual({
      engine: 'webspeech',
      note: CAPABILITY_MESSAGES.offlineLater,
    });
  });
});
