/**
 * Fullscreen and Screen Wake Lock (SPEC §8 last bullet). Thin, fail-soft browser wrappers.
 */

/** Fullscreen is available (not on iPhone Safari, which has no element fullscreen). */
export function fullscreenSupported(): boolean {
  return !!document.fullscreenEnabled && !!document.documentElement.requestFullscreen;
}

export function isFullscreen(): boolean {
  return !!document.fullscreenElement;
}

/** Toggle fullscreen on the whole document (so notices and dialogs stay visible). */
export async function toggleFullscreen(): Promise<void> {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
  } catch (e) {
    console.info('[cadence] fullscreen refused:', e);
  }
}

export function exitFullscreen(): void {
  if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
}

interface WakeLockSentinelLike extends EventTarget {
  released: boolean;
  release(): Promise<void>;
}
interface WakeLockLike {
  request(type: 'screen'): Promise<WakeLockSentinelLike>;
}

/** The "can't keep awake" message shows once per page load, not once per prompter visit. */
let warnedThisLoad = false;

export const WAKE_MESSAGES = {
  unsupported:
    'This browser can’t keep the screen awake. Set your screen timeout to the maximum before your talk.',
} as const;

/**
 * Keeps the screen awake while enabled: requests the lock, re-requests it when the page
 * becomes visible again (the browser drops it when hidden), and releases it on disable.
 * `onUnavailable` fires once per page load if the API is missing or the request is refused.
 */
export class WakeLockKeeper {
  private wanted = false;
  private sentinel: WakeLockSentinelLike | null = null;
  private readonly onVisibility = () => {
    if (this.wanted && document.visibilityState === 'visible') void this.acquire();
  };

  constructor(private readonly onUnavailable: (message: string) => void) {
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  get held(): boolean {
    return !!this.sentinel && !this.sentinel.released;
  }

  enable(): void {
    if (this.wanted) return;
    this.wanted = true;
    void this.acquire();
  }

  disable(): void {
    this.wanted = false;
    const s = this.sentinel;
    this.sentinel = null;
    if (s && !s.released) void s.release().catch(() => {});
  }

  destroy(): void {
    this.disable();
    document.removeEventListener('visibilitychange', this.onVisibility);
  }

  private async acquire(): Promise<void> {
    if (this.held) return;
    const wl = (navigator as unknown as { wakeLock?: WakeLockLike }).wakeLock;
    if (!wl) return this.unavailable();
    try {
      const s = await wl.request('screen');
      if (!this.wanted) {
        void s.release().catch(() => {});
        return;
      }
      this.sentinel = s;
    } catch (e) {
      // Refused (e.g. battery saver) or the page isn't visible yet; visibilitychange retries.
      if (document.visibilityState === 'visible') this.unavailable();
      console.info('[cadence] wake lock refused:', e);
    }
  }

  private unavailable(): void {
    if (warnedThisLoad) return;
    warnedThisLoad = true;
    this.onUnavailable(WAKE_MESSAGES.unsupported);
  }
}
