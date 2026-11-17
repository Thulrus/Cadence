/**
 * Debounced, serialized saver. `schedule()` (re)starts the delay; `flush()` saves now if
 * anything is pending. Saves never overlap: a save requested while one is running runs after it.
 */
export class Autosaver {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private dirty = false;
  private chain: Promise<void> = Promise.resolve();

  constructor(
    private readonly save: () => Promise<void>,
    private readonly delayMs: number,
    private readonly onError: (e: unknown) => void = () => {},
  ) {}

  get pending(): boolean {
    return this.dirty;
  }

  schedule(): void {
    this.dirty = true;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), this.delayMs);
  }

  /** Save now if dirty; resolves when every queued save has finished. */
  flush(): Promise<void> {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    if (this.dirty) {
      this.dirty = false;
      this.chain = this.chain.then(() => this.save()).catch(this.onError);
    }
    return this.chain;
  }

  /** Stop any pending timer without saving. */
  cancel(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.dirty = false;
  }
}
