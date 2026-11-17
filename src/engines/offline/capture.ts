/**
 * Mic capture for the on-device engine: getUserMedia → AudioWorklet that batches raw frames
 * on the audio thread and posts them to the main thread (`OFFLINE_AUDIO.batchMs`).
 *
 * The worklet is a few lines, loaded from a Blob URL so it needs no separate build entry.
 * The AudioContext is created synchronously in `startCapture` so that a call from a user
 * gesture is allowed to run it (autoplay policy); `resume()` is called again after the
 * permission prompt for browsers that start it suspended.
 */
import { batchFrames } from './audio';

export const CAPTURE_CONSTRAINTS: MediaTrackConstraints = {
  channelCount: 1,
  // Browser DSP helps at arm's length in a reverberant room (owner's setup); Vosk's own
  // demo uses the same settings.
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};

const PROCESSOR = 'cadence-capture';
const WORKLET_SOURCE = `
class CadenceCapture extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.size = options.processorOptions.batch;
    this.buf = new Float32Array(this.size);
    this.i = 0;
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) {
      let k = 0;
      while (k < ch.length) {
        const m = Math.min(ch.length - k, this.size - this.i);
        this.buf.set(ch.subarray(k, k + m), this.i);
        this.i += m;
        k += m;
        if (this.i === this.size) {
          this.port.postMessage(this.buf, [this.buf.buffer]);
          this.buf = new Float32Array(this.size);
          this.i = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor('${PROCESSOR}', CadenceCapture);
`;

export interface Capture {
  /** Mic sample rate (the AudioContext's). */
  readonly sampleRate: number;
  stop(): void;
}

export interface CaptureCallbacks {
  onFrames(frames: Float32Array): void;
  /** The mic track ended on its own (unplugged, permission revoked, OS took it). */
  onEnded(): void;
}

export type StartCapture = (cb: CaptureCallbacks) => Promise<Capture>;

/** Real browser capture. Rejects with the getUserMedia error (e.g. NotAllowedError). */
export const startCapture: StartCapture = async (cb) => {
  const ctx = new AudioContext();
  let stream: MediaStream | null = null;
  const close = () => {
    stream?.getTracks().forEach((t) => t.stop());
    void ctx.close().catch(() => {});
  };
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: CAPTURE_CONSTRAINTS });
    const url = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: 'text/javascript' }));
    try {
      await ctx.audioWorklet.addModule(url);
    } finally {
      URL.revokeObjectURL(url);
    }
    await ctx.resume();
    const source = ctx.createMediaStreamSource(stream);
    const node = new AudioWorkletNode(ctx, PROCESSOR, {
      numberOfInputs: 1,
      // A node with no outputs is a sink: it's processed without connecting to the speakers.
      numberOfOutputs: 0,
      channelCount: 1,
      channelCountMode: 'explicit',
      processorOptions: { batch: batchFrames(ctx.sampleRate) },
    });
    node.port.onmessage = (e: MessageEvent<Float32Array>) => cb.onFrames(e.data);
    source.connect(node);
    const track = stream.getAudioTracks()[0];
    let stopped = false;
    track?.addEventListener('ended', () => {
      if (!stopped) cb.onEnded();
    });
    return {
      sampleRate: ctx.sampleRate,
      stop() {
        if (stopped) return;
        stopped = true;
        node.port.onmessage = null;
        source.disconnect();
        close();
      },
    };
  } catch (e) {
    close();
    throw e;
  }
};
