// models.json: the one place a model ID may appear (§9.2, D26). The engine keeps the parsed file in
// memory, rereads it when it changes on disk (an edit in Excel's neighbour, Notepad) and writes it
// atomically when Settings saves. Every call resolves its role at call time, so a change takes
// effect on the next call with no restart (F-16 AC3).
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  ModelsConfig,
  type DecisionModelSettings,
  type LlmRoleConfig,
  type ModelRole,
  type Thresholds,
} from "@gw/shared";
import shipped from "../../../../config/models.json" with { type: "json" };

/** The starting values shipped with the app. */
export function shippedModels(): ModelsConfig {
  return ModelsConfig.parse(structuredClone(shipped));
}

export class ModelsConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelsConfigError";
  }
}

/** What one role resolves to for one call. */
export interface ResolvedRole {
  role: ModelRole;
  provider: string;
  model: string;
  effort: string | undefined;
  maxOutputTokens: number | undefined;
}

export interface ModelsStore {
  get(): ModelsConfig;
  /** Validates, then replaces the config (and the file, when there is one). */
  set(config: ModelsConfig): void;
}

/** In memory only: tests and the engine under plain Node without an app data folder. */
export class MemoryModelsStore implements ModelsStore {
  #config: ModelsConfig;
  constructor(config: ModelsConfig = shippedModels()) {
    this.#config = config;
  }
  get(): ModelsConfig {
    return this.#config;
  }
  set(config: ModelsConfig): void {
    this.#config = ModelsConfig.parse(config);
  }
}

/** `<app data>/models.json`, created from the shipped values on first start. */
export class FileModelsStore implements ModelsStore {
  readonly file: string;
  #config: ModelsConfig;
  #mtimeMs = -1;

  constructor(appDataDir: string) {
    this.file = path.join(appDataDir, "models.json");
    if (!existsSync(this.file)) {
      mkdirSync(appDataDir, { recursive: true });
      writeAtomic(this.file, shippedModels());
    }
    this.#config = this.#read();
  }

  get(): ModelsConfig {
    let mtimeMs: number;
    try {
      mtimeMs = statSync(this.file).mtimeMs;
    } catch {
      return this.#config; // deleted or locked: keep the last good config
    }
    if (mtimeMs !== this.#mtimeMs) {
      try {
        this.#config = this.#read();
      } catch {
        // A half-saved or invalid hand edit: keep the last good config until the file is valid again.
        this.#mtimeMs = mtimeMs;
      }
    }
    return this.#config;
  }

  set(config: ModelsConfig): void {
    const parsed = ModelsConfig.parse(config);
    writeAtomic(this.file, parsed);
    this.#config = parsed;
    this.#mtimeMs = statSync(this.file).mtimeMs;
  }

  #read(): ModelsConfig {
    const mtimeMs = statSync(this.file).mtimeMs;
    const parsed = ModelsConfig.safeParse(JSON.parse(readFileSync(this.file, "utf8")));
    if (!parsed.success) {
      throw new ModelsConfigError(`models.json is invalid: ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}`);
    }
    this.#mtimeMs = mtimeMs;
    return parsed.data;
  }
}

function writeAtomic(file: string, config: ModelsConfig): void {
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(config, null, 2) + "\n", "utf8");
  renameSync(tmp, file);
}

/** The provider and model a role uses now. `model` overrides the chat model with one of its choices. */
export function resolveRole(config: ModelsConfig, role: ModelRole, model?: string): ResolvedRole {
  const rc: LlmRoleConfig = config.roles[role];
  if (model === undefined || model === rc.model) {
    return { role, provider: rc.provider, model: rc.model, effort: rc.effort, maxOutputTokens: rc.max_output_tokens };
  }
  if (role !== "chat" || !config.roles.chat.choices.includes(model)) {
    throw new ModelsConfigError(`model "${model}" is not one of the ${role} role's choices`);
  }
  const provider = providerOfModel(config, model);
  if (!provider) throw new ModelsConfigError(`model "${model}" is not listed under any provider`);
  // A chat choice from another provider keeps the role's effort only when it is the same provider.
  return {
    role,
    provider,
    model,
    effort: provider === rc.provider ? rc.effort : undefined,
    maxOutputTokens: rc.max_output_tokens,
  };
}

export function providerOfModel(config: ModelsConfig, model: string): string | undefined {
  for (const [id, p] of Object.entries(config.providers)) {
    if (p.models?.includes(model)) return id;
  }
  for (const rc of Object.values(config.roles)) {
    if (rc.model === model) return rc.provider;
  }
  return undefined;
}

/** Thresholds and state limit for the decision model the decider role uses now (§8). */
export function deciderSettings(config: ModelsConfig): { thresholds: Thresholds; stateLimitTokens: number } {
  const d = config.roles.decider;
  const own: DecisionModelSettings = config.decision_models?.[d.model] ?? d;
  const base = own.threshold;
  return {
    thresholds: {
      probability: own.thresholds?.probability ?? base,
      choice: own.thresholds?.choice ?? base,
      score: own.thresholds?.score ?? base,
    },
    stateLimitTokens: own.state_limit_tokens,
  };
}
