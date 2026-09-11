import { APIError } from '@/shared/api';
export type SaveStatus = 'saved' | 'pending' | 'saving' | 'error' | 'conflict';
export type SaveState = {
  status: SaveStatus;
  dirty: boolean;
  inFlight: boolean;
  version: number;
  lastSaved: number;
  error: unknown;
};
// Structural comparison avoids serializing a potentially 512 KiB body on each
// keystroke. Snapshots contain JSON values only, and are cloned before queuing.
function equal(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  const left = a as Record<string, unknown>,
    right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  return (
    keys.length === Object.keys(right).length &&
    keys.every((k) => Object.hasOwn(right, k) && equal(left[k], right[k]))
  );
}
export class AutosaveQueue<T> {
  private latest: T;
  private acknowledged: T;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private flight: Promise<number> | null = null;
  private disposed = false;
  private enabled = true;
  private listeners = new Set<() => void>();
  private state: SaveState;
  constructor(
    initial: T,
    version: number,
    private save: (
      snapshot: T,
      version: number,
    ) => Promise<{ version: number; updatedAt: number }>,
    lastSaved = 0,
    private delay = 1700,
  ) {
    this.latest = structuredClone(initial);
    this.acknowledged = structuredClone(initial);
    this.state = {
      status: 'saved',
      dirty: false,
      inFlight: false,
      version,
      lastSaved,
      error: null,
    };
  }
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getSnapshot = () => this.state;
  private emit(patch: Partial<SaveState>) {
    this.state = { ...this.state, ...patch };
    if (!this.disposed) this.listeners.forEach((fn) => fn());
  }
  setEnabled(value: boolean) {
    this.enabled = value;
    if (!value) clearTimeout(this.timer);
  }
  update(snapshot: T) {
    if (this.disposed || equal(snapshot, this.latest)) return;
    this.latest = structuredClone(snapshot);
    const dirty = !equal(this.latest, this.acknowledged);
    this.emit({
      dirty,
      status:
        this.state.status === 'conflict'
          ? 'conflict'
          : this.state.status === 'error'
            ? 'error'
            : this.state.inFlight
              ? 'saving'
              : dirty
                ? 'pending'
                : 'saved',
    });
    clearTimeout(this.timer);
    if (
      dirty &&
      this.enabled &&
      this.state.status !== 'conflict' &&
      this.state.status !== 'error' &&
      !this.flight
    )
      this.timer = setTimeout(() => {
        void this.flush().catch(() => {});
      }, this.delay);
  }
  flush = (): Promise<number> => {
    clearTimeout(this.timer);
    if (this.disposed || !this.enabled)
      return Promise.reject(new Error('Draft is read-only'));
    if (this.state.status === 'conflict')
      return Promise.reject(this.state.error);
    if (this.flight) return this.flight;
    if (!this.state.dirty) return Promise.resolve(this.state.version);
    this.flight = this.drain().finally(() => {
      this.flight = null;
      // An edit may arrive as a save completion is being delivered.
      if (
        this.state.dirty &&
        this.state.status === 'pending' &&
        this.enabled &&
        !this.disposed
      )
        this.timer = setTimeout(() => {
          void this.flush().catch(() => {});
        }, this.delay);
    });
    return this.flight;
  };
  private async drain() {
    while (this.state.dirty && this.enabled && !this.disposed) {
      const snapshot = structuredClone(this.latest);
      this.emit({ status: 'saving', inFlight: true, error: null });
      try {
        const result = await this.save(snapshot, this.state.version);
        this.acknowledged = snapshot;
        const dirty = !equal(this.latest, snapshot);
        this.emit({
          version: result.version,
          lastSaved: result.updatedAt,
          dirty,
          inFlight: false,
          status: dirty ? 'pending' : 'saved',
        });
      } catch (error) {
        this.emit({
          status:
            error instanceof APIError &&
            error.code === 'content_version_conflict'
              ? 'conflict'
              : 'error',
          error,
          inFlight: false,
          dirty: true,
        });
        throw error;
      }
    }
    return this.state.version;
  }
  reload(snapshot: T, version: number, lastSaved: number) {
    if (this.flight) throw new Error('Wait for the current save');
    clearTimeout(this.timer);
    this.latest = structuredClone(snapshot);
    this.acknowledged = structuredClone(snapshot);
    this.emit({
      status: 'saved',
      dirty: false,
      inFlight: false,
      error: null,
      version,
      lastSaved,
    });
  }
  conflict(error: unknown) {
    clearTimeout(this.timer);
    this.emit({ status: 'conflict', error });
  }
  activate() {
    this.disposed = false;
  }
  dispose() {
    this.disposed = true;
    clearTimeout(this.timer);
    this.listeners.clear();
  }
}
