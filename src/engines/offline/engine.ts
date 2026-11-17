/**
 * On-device recognizer (SPEC §5.2): Vosk small English model in a Web Worker, decoding against
 * a grammar built from the script (grammar.ts). Audio never leaves the device.
 *
 *  - start(): opens the mic first (synchronously creating the AudioContext, so the user
 *    gesture counts), loads/reuses the model, creates a recognizer with the script grammar.
 *    Frames that arrive before the recognizer exists are dropped.
 *  - Results: Vosk's `partialresult` is the current utterance's hypothesis (emitted as an
 *    interim when it changes); `result` ends the utterance (emitted as final). Same shape as
 *    Web Speech, so the aligner needs nothing new.
 *  - Level: computed from the same capture stream (no second getUserMedia, so the meter works
 *    on Android too).
 *  - No restart loop: unlike Web Speech, Vosk never stops on its own. A mic track that ends
 *    (unplugged, OS took it) is an error the user resolves by pressing Start again.
 *
 * Browser pieces are injected (`OfflineEngineDeps`) so tests run with fakes.
 */
import { Emitter } from '../../core/emitter';
import type {
  EngineStatus,
  RecognitionEvent,
  RecognizerEngine,
  RecognizerEngineEvents,
} from '../../core/types';
import { levelFromSamples, smoothLevel } from '../micmeter';
import { Downsampler, recognizerRate } from './audio';
import type { Capture, StartCapture } from './capture';
import type { LoadModel, VoskMessage, VoskRecognizer } from './vosk';

export const OFFLINE_MESSAGES = {
  loading: 'Loading the on-device speech model…',
  noMic: 'No microphone was found.',
  micEnded: 'The microphone stopped. Press Start to listen again.',
  modelFailed:
    'The on-device speech model couldn’t start. Try again, or re-download it in Settings.',
  noAudioWorklet: 'This browser can’t capture audio for on-device recognition.',
} as const;

export interface OfflineEngineDeps {
  /** URL of the installed model (ModelStore.url). */
  modelUrl: string;
  /** Grammar phrase list for the current script (buildGrammar). */
  grammar: () => readonly string[];
  loadModel: LoadModel;
  startCapture: StartCapture;
  now?: () => number;
  debug?: (msg: string) => void;
}

export class OfflineEngine implements RecognizerEngine {
  readonly id = 'offline' as const;
  readonly events = new Emitter<RecognizerEngineEvents>();
  private status: EngineStatus = 'idle';
  /** Bumped by every start/stop, so late async steps of an old start bail out. */
  private session = 0;
  private capture: Capture | null = null;
  private recognizer: VoskRecognizer | null = null;
  private down: Downsampler | null = null;
  private level = 0;
  private partial = '';

  constructor(private readonly deps: OfflineEngineDeps) {}

  async start(): Promise<void> {
    if (this.status === 'starting' || this.status === 'listening') return;
    const session = ++this.session;
    const live = () => session === this.session;
    this.setStatus('starting', OFFLINE_MESSAGES.loading);
    // Mic first: AudioContext creation must happen inside the gesture.
    const capturing = this.deps.startCapture({
      onFrames: (f) => {
        if (live()) this.onFrames(f);
      },
      onEnded: () => {
        if (!live()) return;
        this.session++;
        this.teardown();
        this.setStatus('error', OFFLINE_MESSAGES.micEnded);
      },
    });
    const loading = this.deps.loadModel(this.deps.modelUrl);
    loading.catch(() => {}); // handled below; avoid an unhandled rejection if capture fails first
    try {
      const capture = await capturing;
      if (!live()) return capture.stop();
      this.capture = capture;
      const rate = recognizerRate(capture.sampleRate);
      this.down = new Downsampler(capture.sampleRate, rate);
      this.deps.debug?.(`offline: mic ${capture.sampleRate} Hz → recognizer ${rate} Hz`);
    } catch (e) {
      if (!live()) return;
      this.teardown();
      const name = (e as { name?: string } | null)?.name;
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        this.setStatus('no-permission');
      } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
        this.setStatus('error', OFFLINE_MESSAGES.noMic);
      } else {
        this.deps.debug?.(`offline: capture failed: ${String(e)}`);
        this.setStatus('error', OFFLINE_MESSAGES.noAudioWorklet);
      }
      return;
    }
    try {
      const model = await loading;
      const down = this.down;
      if (!live() || !down) return;
      const t0 = this.now();
      const grammar = JSON.stringify(this.deps.grammar());
      const rec = new model.KaldiRecognizer(down.outRate, grammar);
      rec.on('partialresult', (m) => {
        if (this.recognizer === rec) this.onPartial(m);
      });
      rec.on('result', (m) => {
        if (this.recognizer === rec) this.onResult(m);
      });
      rec.on('error', (m) => {
        if (this.recognizer !== rec) return;
        this.deps.debug?.(`offline: recognizer error: ${m.error ?? ''}`);
        this.session++;
        this.teardown();
        this.setStatus('error', OFFLINE_MESSAGES.modelFailed);
      });
      this.recognizer = rec;
      this.partial = '';
      this.deps.debug?.(
        `offline: recognizer created (${grammar.length} chars of grammar, ${Math.round(this.now() - t0)} ms)`,
      );
      this.setStatus('listening');
    } catch (e) {
      if (!live()) return;
      this.deps.debug?.(`offline: model failed: ${String(e)}`);
      console.error('[cadence] on-device model failed:', e);
      this.teardown();
      this.setStatus('error', OFFLINE_MESSAGES.modelFailed);
    }
  }

  stop(): void {
    this.session++;
    const was = this.status;
    this.teardown();
    if (was !== 'idle' && was !== 'paused') this.setStatus('paused');
  }

  private onFrames(frames: Float32Array): void {
    this.level = smoothLevel(this.level, levelFromSamples(frames));
    this.events.emit('level', this.level);
    const rec = this.recognizer;
    if (!rec || !this.down) return;
    const out = this.down.push(frames);
    if (out.length) rec.acceptWaveformFloat(out, this.down.outRate);
  }

  private onPartial(m: VoskMessage): void {
    const text = (m.result?.partial ?? '').trim();
    if (text === this.partial) return;
    this.partial = text;
    if (text) this.emitResult(text, false);
  }

  private onResult(m: VoskMessage): void {
    const text = (m.result?.text ?? '').trim();
    this.partial = '';
    if (text) this.emitResult(text, true);
  }

  private emitResult(text: string, isFinal: boolean): void {
    const ev: RecognitionEvent = { words: text.split(/\s+/), isFinal, timestamp: this.now() };
    this.events.emit('result', ev);
  }

  private teardown(): void {
    const rec = this.recognizer;
    this.recognizer = null;
    try {
      rec?.remove();
    } catch {
      // worker already gone
    }
    this.capture?.stop();
    this.capture = null;
    this.down = null;
    this.partial = '';
    this.level = 0;
  }

  private now(): number {
    return this.deps.now ? this.deps.now() : performance.now();
  }

  private setStatus(status: EngineStatus, message?: string): void {
    this.status = status;
    this.events.emit('status', message === undefined ? { status } : { status, message });
  }
}
