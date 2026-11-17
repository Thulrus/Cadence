/**
 * Cross-module contracts. These are the seams between chunks of work (see docs/ARCHITECTURE.md).
 * Change them only deliberately, and record the change in docs/PROGRESS.md.
 */
import type { Emitter } from './emitter';

// ---------------------------------------------------------------------------
// Speech recognition
// ---------------------------------------------------------------------------

/**
 * One update from a recognizer. `words` is the recognizer's current hypothesis for the
 * *current utterance* as raw strings (not yet normalized). Engines must NOT try to compute
 * deltas; the aligner layer handles cumulative/repeated interim results.
 */
export interface RecognitionEvent {
  words: string[];
  isFinal: boolean;
  /** ms, from performance.now() (or simulated clock). */
  timestamp: number;
}

export type EngineStatus =
  | 'idle'
  | 'starting'
  | 'listening'
  | 'paused'
  | 'restarting'
  | 'no-permission'
  | 'unsupported'
  | 'error';

export interface RecognizerEngineEvents extends Record<string, unknown> {
  result: RecognitionEvent;
  status: { status: EngineStatus; message?: string };
  /** Optional 0..1 input level for the mic meter. */
  level: number;
}

export interface RecognizerEngine {
  readonly id: 'webspeech' | 'offline' | 'simulated';
  /** Must be called from a user gesture for real engines. */
  start(): Promise<void>;
  stop(): void;
  readonly events: Emitter<RecognizerEngineEvents>;
}

// ---------------------------------------------------------------------------
// Position
// ---------------------------------------------------------------------------

/** Why the position changed. Renderer uses this to decide scroll behaviour. */
export type PositionSource = 'align' | 'manual' | 'timed' | 'undo' | 'reset';

export interface PositionChange {
  /** Index of the next expected match token (see ScriptIndex). */
  position: number;
  previous: number;
  source: PositionSource;
}
