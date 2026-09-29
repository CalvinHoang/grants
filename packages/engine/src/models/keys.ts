// Provider API keys (§10.3, F-16 AC1): Windows Credential Manager through @napi-rs/keyring, loaded
// inside the engine process. Keys never go to a file, a log or SQLite. When the OS keyring can't
// load (Linux test containers), keys live in memory for the session only.
import { createRequire } from "node:module";

export interface KeyStore {
  readonly kind: "credential-manager" | "memory" | "unavailable";
  get(provider: string): Promise<string | null>;
  set(provider: string, key: string): Promise<void>;
  delete(provider: string): Promise<void>;
}

/** Credential Manager target names are "<service>/<provider>" under this service. */
export const KEYRING_SERVICE = "Grant Workbench";

export class MemoryKeyStore implements KeyStore {
  readonly kind = "memory" as const;
  readonly #keys = new Map<string, string>();
  async get(provider: string) {
    return this.#keys.get(provider) ?? null;
  }
  async set(provider: string, key: string) {
    this.#keys.set(provider, key);
  }
  async delete(provider: string) {
    this.#keys.delete(provider);
  }
}

interface KeyringEntry {
  getPassword(): string | null | undefined;
  setPassword(password: string): void;
  deletePassword(): boolean;
}
type EntryCtor = new (service: string, account: string) => KeyringEntry;

export class CredentialManagerKeyStore implements KeyStore {
  readonly kind = "credential-manager" as const;
  readonly #Entry: EntryCtor;

  constructor(Entry: EntryCtor) {
    this.#Entry = Entry;
  }

  async get(provider: string) {
    // Returns null for a missing entry; a real keyring failure throws and is reported.
    return new this.#Entry(KEYRING_SERVICE, provider).getPassword() ?? null;
  }
  async set(provider: string, key: string) {
    new this.#Entry(KEYRING_SERVICE, provider).setPassword(key);
  }
  async delete(provider: string) {
    try {
      new this.#Entry(KEYRING_SERVICE, provider).deletePassword();
    } catch {
      // already gone
    }
  }
}

/**
 * Windows with a keyring that won't load: keys can't be kept, so saving one fails visibly instead
 * of seeming to work and vanishing on restart.
 */
export class UnavailableKeyStore implements KeyStore {
  readonly kind = "unavailable" as const;
  async get() {
    return null;
  }
  async set(): Promise<void> {
    throw new Error("Windows Credential Manager could not be opened, so the key was not saved.");
  }
  async delete() {}
}

/**
 * Loads @napi-rs/keyring and proves it works in this process with a write, read and delete of a
 * probe entry. If any step fails: on Windows the store is "unavailable" (saving a key fails with a
 * message); elsewhere (Linux test containers) keys live in memory. Engine info reports which.
 */
export function openKeyStore(mode: "auto" | "memory" = "auto"): KeyStore {
  if (mode === "memory") return new MemoryKeyStore();
  try {
    // Native module: kept out of the bundle and loaded at run time (build.mjs copies it beside the engine).
    const require = createRequire(__filename_or_url());
    const { Entry } = require("@napi-rs/keyring") as { Entry: EntryCtor };
    const probe = new Entry(KEYRING_SERVICE, "self-check");
    const token = `probe-${process.pid}-${Date.now()}`;
    probe.setPassword(token);
    const back = probe.getPassword();
    probe.deletePassword();
    if (back !== token) throw new Error("keyring read-back mismatch");
    return new CredentialManagerKeyStore(Entry);
  } catch {
    return process.platform === "win32" ? new UnavailableKeyStore() : new MemoryKeyStore();
  }
}

function __filename_or_url(): string {
  // CommonJS bundle (Electron) has __filename; ESM (vitest) has import.meta.url.
  return typeof __filename === "string" ? __filename : import.meta.url;
}
