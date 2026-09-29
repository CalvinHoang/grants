// Per-provider limiter (§7.8). Bounds concurrency, retries the error set, warms each shared prompt
// prefix before fanning out, and pauses on a spend cap until the advisor resumes.
import { ProviderError } from "@gw/shared";

export interface LimiterOptions {
  maxConcurrency: number;
  /** Retries after the first attempt for rate limits, overload and network errors. */
  maxRetries?: number;
  /** First backoff when the provider gives no retry-after; doubles each attempt. */
  backoffMs?: number;
  /** How long a warmed prefix stays warm (the provider cache TTL). */
  warmTtlMs?: number;
  /** Called once when a spend cap pauses this provider. */
  onPause?: () => void;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

export interface Task<T> {
  /** Calls sharing this key share a cached prefix; null for no warm-up. */
  prefixKey: string | null;
  signal?: AbortSignal;
  run(onFirstToken: () => void): Promise<T>;
}

const defaultSleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const onAbort = () => {
      clearTimeout(t);
      reject(signal!.reason);
    };
    const t = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });

interface Warm {
  /** Resolves when the warming request's first token arrives, or it ends without one. */
  ready: Promise<void>;
  release: () => void;
  warmedAt: number | null;
}

export class ProviderLimiter {
  readonly #o: Required<Omit<LimiterOptions, "onPause">> & Pick<LimiterOptions, "onPause">;
  #active = 0;
  readonly #queue: (() => void)[] = [];
  readonly #warm = new Map<string, Warm>();
  #paused: { promise: Promise<void>; resume: () => void } | null = null;

  constructor(options: LimiterOptions) {
    this.#o = {
      maxRetries: 4,
      backoffMs: 1000,
      warmTtlMs: 4 * 60_000,
      sleep: defaultSleep,
      ...options,
    };
  }

  get paused(): boolean {
    return this.#paused !== null;
  }

  get active(): number {
    return this.#active;
  }

  setMaxConcurrency(n: number): void {
    this.#o.maxConcurrency = Math.max(1, n);
    this.#drain();
  }

  /** Releases calls held by a spend cap. */
  resume(): void {
    const p = this.#paused;
    this.#paused = null;
    p?.resume();
  }

  async schedule<T>(task: Task<T>): Promise<T> {
    const warming = await this.#claimOrWaitWarm(task.prefixKey, task.signal);
    let warmed = false;
    const onFirstToken = () => {
      if (warming && !warmed) {
        warmed = true;
        warming.warmedAt = Date.now();
        warming.release();
      }
    };
    try {
      return await this.#runWithRetries(task, onFirstToken);
    } finally {
      if (warming && !warmed) {
        // Never streamed (failed, or no first-token signal): let a waiting caller warm instead.
        this.#warm.delete(task.prefixKey!);
        warming.release();
      }
    }
  }

  async #runWithRetries<T>(task: Task<T>, onFirstToken: () => void): Promise<T> {
    let attempt = 0;
    for (;;) {
      if (this.#paused) await abortable(this.#paused.promise, task.signal);
      await this.#acquire(task.signal);
      if (this.#paused) {
        // A spend cap started while this call was queued: give the slot back and wait.
        this.#release();
        continue;
      }
      let result: T;
      try {
        result = await task.run(onFirstToken);
      } catch (err) {
        this.#release();
        if (!(err instanceof ProviderError)) throw err;
        if (err.kind === "spend_cap") {
          this.#pause();
          continue; // held until resume(), then tried again
        }
        const retryable = err.kind === "rate_limited" || err.kind === "overloaded" || err.kind === "network";
        if (!retryable || attempt >= this.#o.maxRetries) throw err;
        const wait =
          err.kind === "rate_limited" && err.retryAfter !== null
            ? err.retryAfter * 1000
            : this.#o.backoffMs * 2 ** attempt * (0.75 + Math.random() * 0.25);
        attempt++;
        await this.#o.sleep(wait, task.signal);
        continue;
      }
      this.#release();
      return result;
    }
  }

  /**
   * The first call on a prefix becomes its warmer and goes alone; the rest wait until its first
   * token arrives (the cache is readable from then on, §7.8). Returns the entry when this caller warms.
   */
  async #claimOrWaitWarm(key: string | null, signal?: AbortSignal): Promise<Warm | null> {
    if (key === null) return null;
    for (;;) {
      const w = this.#warm.get(key);
      if (w && w.warmedAt !== null && Date.now() - w.warmedAt > this.#o.warmTtlMs) this.#warm.delete(key);
      const current = this.#warm.get(key);
      if (!current) {
        let release!: () => void;
        const entry: Warm = { ready: new Promise<void>((r) => (release = r)), warmedAt: null, release: () => release() };
        this.#warm.set(key, entry);
        return entry;
      }
      if (current.warmedAt !== null) return null;
      await abortable(current.ready, signal);
    }
  }

  #pause(): void {
    if (this.#paused) return;
    let resume!: () => void;
    const promise = new Promise<void>((r) => (resume = r));
    this.#paused = { promise, resume };
    this.#o.onPause?.();
  }

  #acquire(signal?: AbortSignal): Promise<void> {
    if (this.#active < this.#o.maxConcurrency) {
      this.#active++;
      return Promise.resolve();
    }
    if (signal?.aborted) return Promise.reject(signal.reason);
    return new Promise<void>((resolve, reject) => {
      const grant = () => {
        signal?.removeEventListener("abort", onAbort);
        this.#active++;
        resolve();
      };
      const onAbort = () => {
        const i = this.#queue.indexOf(grant);
        if (i >= 0) this.#queue.splice(i, 1);
        reject(signal!.reason);
      };
      signal?.addEventListener("abort", onAbort, { once: true });
      this.#queue.push(grant);
    });
  }

  #release(): void {
    this.#active--;
    this.#drain();
  }

  #drain(): void {
    while (this.#active < this.#o.maxConcurrency && this.#queue.length > 0) this.#queue.shift()!();
  }
}

/** Waits for `p`, or rejects when `signal` aborts; the listener is removed either way (one run-wide
 * signal is shared by thousands of calls). */
function abortable<T>(p: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return p;
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    p.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
  });
}
