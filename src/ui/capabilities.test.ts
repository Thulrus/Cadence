import { describe, expect, it } from 'vitest';
import {
  CAPABILITY_MESSAGES,
  detectCapabilities,
  meterEnabled,
  offlineCapable,
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
  hasAudioWorklet: true,
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
      note: CAPABILITY_MESSAGES.firefox,
    });
    const other = detectCapabilities(env({ hasSpeechRecognition: false }));
    expect(resolveEngine('auto', other, prod).note).toBe(CAPABILITY_MESSAGES.unsupported);
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
      note: CAPABILITY_MESSAGES.offlineMissing,
    });
  });
});

describe('on-device engine selection', () => {
  const ready = { ...prod, offlineReady: true };
  const chrome = detectCapabilities(env({}));
  const firefox = detectCapabilities(
    env({ userAgent: FIREFOX, hasSpeechRecognition: false, maxTouchPoints: 0 }),
  );

  it('auto prefers on-device once the model is installed', () => {
    expect(resolveEngine('auto', chrome, ready)).toEqual({ engine: 'offline' });
    expect(resolveEngine('auto', chrome, prod)).toEqual({ engine: 'webspeech' });
  });

  it('explicit choices win where both work', () => {
    expect(resolveEngine('offline', chrome, ready)).toEqual({ engine: 'offline' });
    expect(resolveEngine('webspeech', chrome, ready)).toEqual({ engine: 'webspeech' });
  });

  it('gives Firefox voice following once the model is installed', () => {
    expect(resolveEngine('auto', firefox, ready)).toEqual({ engine: 'offline' });
    expect(resolveEngine('webspeech', firefox, ready)).toEqual({ engine: 'offline' });
    expect(resolveEngine('auto', firefox, prod)).toEqual({
      engine: 'none',
      note: CAPABILITY_MESSAGES.firefox,
    });
  });

  it('needs a secure context, getUserMedia and AudioWorklet', () => {
    for (const e of [
      { isSecureContext: false },
      { hasGetUserMedia: false },
      { hasAudioWorklet: false },
    ]) {
      const caps = detectCapabilities(env(e));
      expect(offlineCapable(caps)).toBe(false);
      expect(resolveEngine('auto', caps, ready).engine).not.toBe('offline');
    }
    expect(
      resolveEngine('offline', detectCapabilities(env({ hasAudioWorklet: false })), ready),
    ).toEqual({
      engine: 'webspeech',
      note: CAPABILITY_MESSAGES.offlineUnsupported,
    });
  });

  it('?sim still wins', () => {
    expect(resolveEngine('offline', chrome, { ...ready, forceSim: true }).engine).toBe('simulated');
  });
});

describe('per-browser messaging (SPEC §2)', () => {
  const IPHONE =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
  const CHROME_DESKTOP =
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
  const cases: [string, Partial<CapabilityEnv>, string, string | undefined][] = [
    ['Chrome desktop', { userAgent: CHROME_DESKTOP, maxTouchPoints: 0 }, 'webspeech', undefined],
    ['Chrome Android', {}, 'webspeech', undefined],
    ['Safari iPadOS', { userAgent: IPAD }, 'webspeech', CAPABILITY_MESSAGES.ios],
    ['Safari iPhone', { userAgent: IPHONE }, 'webspeech', CAPABILITY_MESSAGES.ios],
    [
      'iOS without speech (home-screen app)',
      { userAgent: IPHONE, hasSpeechRecognition: false },
      'none',
      CAPABILITY_MESSAGES.unsupported,
    ],
    [
      'Firefox',
      { userAgent: FIREFOX, hasSpeechRecognition: false, maxTouchPoints: 0 },
      'none',
      CAPABILITY_MESSAGES.firefox,
    ],
    ['plain http', { isSecureContext: false }, 'none', CAPABILITY_MESSAGES.insecure],
  ];
  for (const [name, e, engine, note] of cases) {
    it(name, () => {
      const r = resolveEngine('auto', detectCapabilities(env(e)), prod);
      expect(r.engine).toBe(engine);
      expect(r.note).toBe(note);
    });
  }
});

describe('meterEnabled', () => {
  const android = detectCapabilities(env({}));
  const desktop = detectCapabilities(
    env({ userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Chrome/130.0.0.0 Safari/537.36' }),
  );
  it('auto is off on Android (blocks Web Speech), on elsewhere', () => {
    expect(android.android).toBe(true);
    expect(meterEnabled('auto', android)).toBe(false);
    expect(meterEnabled('auto', desktop)).toBe(true);
  });
  it('on/off override; no getUserMedia means off', () => {
    expect(meterEnabled('on', android)).toBe(true);
    expect(meterEnabled('off', desktop)).toBe(false);
    expect(meterEnabled('on', { ...desktop, getUserMedia: false })).toBe(false);
  });
});
