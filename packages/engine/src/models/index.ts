// Model services for the engine: models.json store, keys, call log, the LanguageModel router and the
// DecisionModel router, plus the settings.* RPC handlers that edit them (F-16).
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import {
  type ModelsConfig,
  ProviderError,
  missingCapabilities,
  type Capabilities,
  type Handlers,
  type ModelRole,
  type ProviderInfo,
  type RoleTestResult,
  RpcError,
} from "@gw/shared";
import { AnthropicAdapter } from "./adapters/anthropic";
import { CopilotAdapter, type GraphTokenProvider } from "./adapters/copilot";
import { OpenAiAdapter } from "./adapters/openai";
import type { KeyLookup, ProviderAdapter } from "./adapters/types";
import { SqliteCallLog, type CallLog } from "./call-log";
import { FileModelsStore, MemoryModelsStore, type ModelsStore } from "./config-store";
import { JEV_PROVIDER, JevDecisionModel } from "./decision/jev";
import { LlmDecisionModel } from "./decision/llm-standin";
import { DecisionRouter } from "./decision/router";
import { openKeyStore, type KeyStore } from "./keys";
import { ModelRouter, OutputError, capabilitiesOf } from "./router";

export { ModelRouter, OutputError } from "./router";
export { DecisionRouter } from "./decision/router";
export type { KeyStore } from "./keys";
export type { ModelsStore } from "./config-store";

export interface ModelServicesOptions {
  /** App data folder holding models.json and usage.db; in memory when absent (tests). */
  appDataDir?: string;
  keyStore?: KeyStore | "auto" | "memory";
  /** Microsoft Graph token for Copilot; supplied by the Microsoft sign-in (WP-5). */
  graphToken?: GraphTokenProvider;
  fetch?: typeof fetch;
  onPause?: (provider: string) => void;
}

export interface ModelServices {
  store: ModelsStore;
  keys: KeyStore;
  log: CallLog;
  llm: ModelRouter;
  decision: DecisionRouter;
  handlers: Handlers;
}

/**
 * The `error` event sent when a provider's spend cap pauses its calls (§7.8). The run waits, and
 * `settings.resumeProvider` releases it once the advisor has raised the cap.
 */
export function spendCapEvent(provider: string) {
  return {
    code: "provider.spend_cap",
    message: `${provider}: spend cap reached; calls are paused`,
    applicationId: null,
    flagId: null,
  };
}

const CAPABILITY_NAMES = {
  json_schema: "structured output",
  usage_reporting: "token usage reporting",
  prompt_cache: "prompt caching",
  streaming: "streaming",
} as const;

/** Capabilities reported for jev: it answers typed questions only (§8.1). */
const JEV_CAPABILITIES: Capabilities = {
  json_schema: false,
  prompt_cache: false,
  effort_levels: [],
  streaming: false,
  usage_reporting: true,
  max_context: 64_000,
  max_output: 1,
};

export function createModelServices(options: ModelServicesOptions = {}): ModelServices {
  const store: ModelsStore = options.appDataDir ? new FileModelsStore(options.appDataDir) : new MemoryModelsStore();
  const keys: KeyStore =
    typeof options.keyStore === "object" ? options.keyStore : openKeyStore(options.keyStore ?? "auto");
  const db = new DatabaseSync(options.appDataDir ? path.join(options.appDataDir, "usage.db") : ":memory:");
  const log = new SqliteCallLog(db);
  const keyLookup: KeyLookup = (p) => keys.get(p);
  const baseUrl = (p: string) => () => store.get().providers[p]?.base_url;

  const adapters: ProviderAdapter[] = [
    new AnthropicAdapter({ keys: keyLookup, baseUrl: baseUrl("anthropic"), fetch: options.fetch }),
    new OpenAiAdapter({ keys: keyLookup, baseUrl: baseUrl("openai"), fetch: options.fetch }),
    new CopilotAdapter({ token: options.graphToken ?? (async () => null), baseUrl: baseUrl("microsoft365"), fetch: options.fetch }),
  ];
  const llm = new ModelRouter({ store, adapters, log, onPause: options.onPause });
  const jev = new JevDecisionModel({ store, keys: keyLookup, limiter: () => llm.limiter(JEV_PROVIDER), log, fetch: options.fetch });
  const decision = new DecisionRouter(store, jev, new LlmDecisionModel(llm));

  const capsFor = (config: ModelsConfig, provider: string, model: string): Capabilities | null => {
    if (provider === JEV_PROVIDER) return JEV_CAPABILITIES;
    const a = llm.adapter(provider);
    return a ? capabilitiesOf(config, a, model) : null;
  };

  /** Settings refuses a mapping that lacks what a role needs (§9.1). */
  const validate = (config: ModelsConfig): void => {
    const problems: string[] = [];
    for (const [role, rc] of Object.entries(config.roles) as [ModelRole, ModelsConfig["roles"][ModelRole]][]) {
      const name = role[0]!.toUpperCase() + role.slice(1);
      if (rc.provider === JEV_PROVIDER) {
        if (role !== "decider") problems.push(`${name} can't use jev: jev only answers decision questions.`);
        continue;
      }
      const caps = capsFor(config, rc.provider, rc.model);
      if (!caps) {
        problems.push(`${name}: no adapter for provider "${rc.provider}".`);
        continue;
      }
      const missing = missingCapabilities(role, caps).map((c) => CAPABILITY_NAMES[c]);
      if (missing.length) problems.push(`${name} can't use ${rc.model}: it has no ${missing.join(" or ")}.`);
      if (rc.effort && caps.effort_levels.length > 0 && !caps.effort_levels.includes(rc.effort)) {
        problems.push(`${name}: ${rc.model} has no "${rc.effort}" effort.`);
      }
    }
    if (problems.length) throw new RpcError("invalid_params", problems.join(" "));
  };

  const testRole = async (role: ModelRole): Promise<RoleTestResult> => {
    const config = store.get();
    const rc = config.roles[role];
    const started = performance.now();
    const result = (error: RoleTestResult["error"]): RoleTestResult => ({
      ok: error === null,
      role,
      provider: rc.provider,
      modelId: rc.model,
      latencyMs: Math.round(performance.now() - started),
      error,
    });
    try {
      if (role === "decider") {
        await decision.ask(
          { id: "settings.test", kind: "probability", statement_or_prompt: "The state names a colour.", state: "Blue." },
          { task: "settings.test" },
        );
      } else {
        const caps = capsFor(config, rc.provider, rc.model);
        const schema = caps?.json_schema ? z.object({ ok: z.boolean() }) : undefined;
        await llm.generate(role, { stable: "", variable: schema ? 'Return {"ok": true}.' : "Reply with the word ok." }, schema, {
          task: "settings.test",
        });
      }
      return result(null);
    } catch (err) {
      if (err instanceof ProviderError) return result({ kind: err.kind, message: err.message });
      if (err instanceof OutputError) return result({ kind: "invalid_output", message: err.message });
      throw err;
    }
  };

  const handlers: Handlers = {
    "settings.getModels": () => store.get(),
    "settings.setModels": (config) => {
      validate(config);
      store.set(config);
      return { ok: true as const };
    },
    "settings.setKey": async ({ provider, key }) => {
      if (!(provider in store.get().providers)) throw new RpcError("invalid_params", `unknown provider "${provider}"`);
      await keys.set(provider, key);
      return { ok: true as const };
    },
    "settings.hasKey": async ({ provider }) => ({ present: (await keys.get(provider)) !== null }),
    "settings.deleteKey": async ({ provider }) => {
      await keys.delete(provider);
      return { ok: true as const };
    },
    "settings.providers": async () => {
      const config = store.get();
      const providers: ProviderInfo[] = [];
      for (const [id, p] of Object.entries(config.providers)) {
        const models = new Set(p.models ?? []);
        for (const rc of Object.values(config.roles)) if (rc.provider === id) models.add(rc.model);
        const list = [...models].flatMap((m) => {
          const caps = capsFor(config, id, m);
          return caps ? [{ id: m, capabilities: caps }] : [];
        });
        providers.push({ id, hasKey: (await keys.get(id)) !== null, models: list });
      }
      return { providers };
    },
    "settings.testRole": ({ role }) => testRole(role),
    "settings.usage": () => log.summary(),
    "settings.resumeProvider": ({ provider }) => {
      llm.resume(provider);
      return { ok: true as const };
    },
  };

  return { store, keys, log, llm, decision, handlers };
}
