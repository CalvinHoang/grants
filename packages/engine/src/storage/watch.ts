// Notices when a file changes on disk (build spec §5.2: the engine rereads a table when it changes).
// Excel saves by writing a temp file and renaming it over the original, so the folder is watched,
// not the file. fs.watch can miss events (OneDrive-redirected Documents, network drives), so a slow
// poll backs it up. Changes are detected by content hash, so the engine's own writes (recorded with
// `acknowledge`) and saves that change nothing are ignored.
import { createHash } from "node:crypto";
import { watch, promises as fs, type FSWatcher } from "node:fs";
import path from "node:path";

export function sha256(data: Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

export interface FileWatcherOptions {
  /** Quiet time after the last event before the file is read (Excel fires several events per save). */
  debounceMs?: number;
  pollMs?: number;
}

export class FileWatcher {
  private knownHash: string | null = null;
  /** mtime and size at the last read, so the poll only reads the file when it may have changed. */
  private knownStat: string | null = null;
  private watcher: FSWatcher | null = null;
  private poller: ReturnType<typeof setInterval> | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private checking: Promise<void> | null = null;
  private again = false;
  private forceNext = false;
  /** Bumped by acknowledge(); a read that started before an acknowledged write is discarded. */
  private generation = 0;
  private closed = false;

  constructor(
    readonly file: string,
    /** Called with the new bytes whenever the content differs from the last known content. */
    private readonly onChange: (data: Uint8Array) => void | Promise<void>,
    private readonly options: FileWatcherOptions = {},
  ) {}

  /** Starts watching. `initial` is the content the caller already has. */
  start(initial: Uint8Array | null): void {
    this.knownHash = initial ? sha256(initial) : null;
    const name = path.basename(this.file);
    try {
      this.watcher = watch(path.dirname(this.file), { persistent: false }, (_event, changed) => {
        if (changed === null || changed.toString() === name) this.schedule(true);
      });
      this.watcher.on("error", () => {
        this.watcher?.close();
        this.watcher = null; // The poll carries on.
      });
    } catch {
      this.watcher = null;
    }
    this.poller = setInterval(() => this.schedule(false), this.options.pollMs ?? 2000);
    this.poller.unref?.();
  }

  /** Records content the engine wrote itself, so the watcher doesn't report it back. */
  acknowledge(data: Uint8Array): void {
    this.knownHash = sha256(data);
    this.knownStat = null;
    this.generation++;
  }

  /** Checks the file now; resolves once any resulting onChange has finished. */
  async check(force = true): Promise<void> {
    if (force) this.forceNext = true;
    if (this.checking) {
      this.again = true;
      return this.checking;
    }
    this.checking = (async () => {
      do {
        this.again = false;
        const forced = this.forceNext;
        this.forceNext = false;
        await this.readOnce(forced);
      } while (this.again && !this.closed);
    })().finally(() => {
      this.checking = null;
    });
    return this.checking;
  }

  close(): void {
    this.closed = true;
    this.watcher?.close();
    if (this.poller) clearInterval(this.poller);
    if (this.timer) clearTimeout(this.timer);
  }

  private schedule(force: boolean): void {
    if (this.closed) return;
    if (force) this.forceNext = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.check(false);
    }, this.options.debounceMs ?? 250);
  }

  /** Reads the file if it may have changed; `forced` skips the mtime/size shortcut. */
  private async readOnce(forced: boolean): Promise<void> {
    const generation = this.generation;
    let data: Uint8Array;
    try {
      const st = await fs.stat(this.file);
      const stamp = `${st.mtimeMs}:${st.size}`;
      if (!forced && stamp === this.knownStat) return;
      data = await fs.readFile(this.file);
      this.knownStat = stamp;
    } catch {
      return; // Missing or locked mid-save: the next event or poll tries again.
    }
    // The engine wrote the file while this read was in flight: these bytes may be the old content.
    if (generation !== this.generation) return;
    const hash = sha256(data);
    if (hash === this.knownHash) return;
    this.knownHash = hash;
    await this.onChange(data);
  }
}
