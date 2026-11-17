/**
 * Startup capability detection (SPEC §2) and engine resolution. Pure functions over a small
 * environment snapshot, so they are unit-tested without a browser.
 */
import type { EngineChoice, MicMeterMode } from '../storage/settings';

export interface Capabilities {
  /** SpeechRecognition or webkitSpeechRecognition exists. */
  webSpeech: boolean;
  /** Secure context (HTTPS or localhost): required for the mic. */
  secure: boolean;
  /** navigator.mediaDevices.getUserMedia exists (mic meter). */
  getUserMedia: boolean;
  ios: boolean;
  android: boolean;
  firefox: boolean;
}

export interface CapabilityEnv {
  hasSpeechRecognition: boolean;
  isSecureContext: boolean;
  hasGetUserMedia: boolean;
  userAgent: string;
  /** navigator.maxTouchPoints (iPadOS reports a Mac UA). */
  maxTouchPoints: number;
}

export function detectCapabilities(env: CapabilityEnv): Capabilities {
  const ua = env.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && env.maxTouchPoints > 1);
  return {
    webSpeech: env.hasSpeechRecognition,
    secure: env.isSecureContext,
    getUserMedia: env.hasGetUserMedia,
    ios,
    android: /Android/.test(ua),
    firefox: /Firefox\//.test(ua) && !/Seamonkey/i.test(ua),
  };
}

/** Snapshot the real browser environment. */
export function browserEnv(): CapabilityEnv {
  const w = window as unknown as Record<string, unknown>;
  return {
    hasSpeechRecognition: !!(w.SpeechRecognition ?? w.webkitSpeechRecognition),
    isSecureContext: window.isSecureContext,
    hasGetUserMedia: !!navigator.mediaDevices?.getUserMedia,
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
  };
}

/**
 * Whether to run the mic level meter. On Android Chrome a second capture stream starves Web
 * Speech (recognition reports listening but hears nothing; owner-confirmed), so `auto` is off.
 */
export function meterEnabled(mode: MicMeterMode, caps: Capabilities): boolean {
  if (!caps.getUserMedia || mode === 'off') return false;
  return mode === 'on' || !caps.android;
}

export type ResolvedEngine = 'webspeech' | 'simulated' | 'none';

export interface EngineResolution {
  engine: ResolvedEngine;
  /** User-facing note (why voice is unavailable, or a caveat). */
  note?: string;
}

export const CAPABILITY_MESSAGES = {
  unsupported: "Voice following isn't available in this browser; timed and manual modes work.",
  insecure: 'Voice following needs a secure (https) connection; timed and manual modes work.',
  ios: 'Voice following on iPhone/iPad Safari is best effort and may stop unexpectedly.',
  offlineLater: 'The offline speech engine is not available yet; using the browser speech service.',
} as const;

/**
 * Pick the engine for a run. `forceSim` (`?sim`) always wins. `auto`/`webspeech` use Web
 * Speech when available; otherwise dev builds fall back to the simulator and production to
 * `none` (manual/timed only). `offline` (M4) isn't built yet and falls back like `auto`.
 */
export function resolveEngine(
  choice: EngineChoice,
  caps: Capabilities,
  opts: { dev: boolean; forceSim: boolean },
): EngineResolution {
  if (opts.forceSim) return { engine: 'simulated' };
  const notes: string[] = [];
  if (choice === 'offline') notes.push(CAPABILITY_MESSAGES.offlineLater);
  const voiceOk = caps.webSpeech && caps.secure;
  if (!voiceOk) {
    const why = !caps.webSpeech ? CAPABILITY_MESSAGES.unsupported : CAPABILITY_MESSAGES.insecure;
    return opts.dev ? { engine: 'simulated', note: why } : { engine: 'none', note: why };
  }
  if (caps.ios) notes.push(CAPABILITY_MESSAGES.ios);
  return notes.length ? { engine: 'webspeech', note: notes.join(' ') } : { engine: 'webspeech' };
}
