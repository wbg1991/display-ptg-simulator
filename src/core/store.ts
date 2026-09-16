/** Minimal reactive store - no framework, just get/set/subscribe. */
export class Store<T extends object> {
  private listeners = new Set<(state: T) => void>();

  constructor(private state: T) {}

  get(): Readonly<T> {
    return this.state;
  }

  /** Shallow-merge a patch into state and notify subscribers. */
  set(patch: Partial<T>): void {
    this.state = { ...this.state, ...patch };
    this.emit();
  }

  /** Functional update when the next state depends on the previous one. */
  update(fn: (state: Readonly<T>) => T): void {
    this.state = fn(this.state);
    this.emit();
  }

  /** Subscribe; the callback fires immediately with the current state. */
  subscribe(fn: (state: Readonly<T>) => void): () => void {
    this.listeners.add(fn);
    fn(this.state);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const l of this.listeners) l(this.state);
  }
}
