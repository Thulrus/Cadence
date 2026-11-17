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
  /** navigator.mediaDevices.getUserMedia exists (mic meter, on-device engine). */
  getUserMedia: boolean;
  /** AudioWorkletNode exists (on-device engine capture). */
  audioWorklet: boolean;
  ios: boolean;
  android: boolean;
  firefox: boolean;
}

export interface CapabilityEnv {
  hasSpeechRecognition: boolean;
  isSecureContext: boolean;
  hasGetUserMedia: boolean;
  hasAudioWorklet?: boolean;
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
    audioWorklet: env.hasAudioWorklet ?? false,
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
    hasAudioWorklet: typeof AudioWorkletNode !== 'undefined',
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

export type ResolvedEngine = 'webspeech' | 'offline' | 'simulated' | 'none';

export interface EngineResolution {
  engine: ResolvedEngine;
  /** User-facing note (why voice is unavailable, or a caveat). */
  note?: string;
}

export const CAPABILITY_MESSAGES = {
  unsupported:
    'This browser has no built-in speech recognition. Download the on-device speech model in Settings → Speech engine for voice following; timed and manual modes always work.',
  firefox:
    "Firefox doesn't support browser speech recognition. Download the on-device speech model in Settings → Speech engine for voice following; timed and manual modes always work.",
  insecure: 'Voice following needs a secure (https) connection; timed and manual modes work.',
  ios: 'Voice following on iPhone/iPad Safari is best effort and may stop unexpectedly.',
  offlineMissing:
    'The on-device speech model isn’t downloaded yet (Settings → Speech engine); using the browser speech service for now.',
  offlineUnsupported:
    'On-device recognition isn’t supported in this browser; using the browser speech service.',
} as const;

/** The on-device engine can run here (it still needs the model downloaded). */
export function offlineCapable(caps: Capabilities): boolean {
  return caps.secure && caps.getUserMedia && caps.audioWorklet;
}

export interface ResolveOptions {
  dev: boolean;
  forceSim: boolean;
  /** The on-device model is installed (settings flag, verified against storage at mount). */
  offlineReady?: boolean;
}

/**
 * Pick the engine for a run. `forceSim` (`?sim`) always wins.
 *  - `auto`: on-device when its model is installed (lower latency, private, no network:
 *    docs/decisions/0001-offline-asr.md), else Web Speech, else nothing.
 *  - `offline`: on-device; without the model, falls back like `auto` with a note.
 *  - `webspeech`: Web Speech; where it's unavailable, on-device if installed.
 * With no engine, dev builds use the simulator and production `none` (manual/timed only).
 */
export function resolveEngine(
  choice: EngineChoice,
  caps: Capabilities,
  opts: ResolveOptions,
): EngineResolution {
  if (opts.forceSim) return { engine: 'simulated' };
  const offlineOk = offlineCapable(caps) && !!opts.offlineReady;
  const voiceOk = caps.webSpeech && caps.secure;
  if (offlineOk && (choice !== 'webspeech' || !voiceOk)) return { engine: 'offline' };
  const notes: string[] = [];
  if (choice === 'offline') {
    notes.push(
      offlineCapable(caps)
        ? CAPABILITY_MESSAGES.offlineMissing
        : CAPABILITY_MESSAGES.offlineUnsupported,
    );
  }
  if (!voiceOk) {
    const why = caps.webSpeech
      ? CAPABILITY_MESSAGES.insecure
      : caps.firefox
        ? CAPABILITY_MESSAGES.firefox
        : CAPABILITY_MESSAGES.unsupported;
    return opts.dev ? { engine: 'simulated', note: why } : { engine: 'none', note: why };
  }
  if (caps.ios) notes.push(CAPABILITY_MESSAGES.ios);
  return notes.length ? { engine: 'webspeech', note: notes.join(' ') } : { engine: 'webspeech' };
}
