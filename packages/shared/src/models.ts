// Model roles and the models.json file (build spec §9.2, D20, D26).
// Code and prompts name roles only; models.json is the single place a model ID may appear.
import { z } from "zod";

export const ModelRole = z.enum(["drafter", "worker", "extractor", "decider", "chat"]);
export type ModelRole = z.infer<typeof ModelRole>;

export const Effort = z.string().min(1);

/** A language-model role (drafter, worker, extractor). */
export const LlmRoleConfig = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),
  effort: Effort.optional(),
  /** Output cap per call; the adapter's default applies when absent. */
  max_output_tokens: z.number().int().positive().optional(),
});
export type LlmRoleConfig = z.infer<typeof LlmRoleConfig>;

/** Thresholds per question kind (§8 threshold rule). */
export const Thresholds = z.object({
  probability: z.number().min(0).max(1),
  choice: z.number().min(0).max(1),
  score: z.number().min(0).max(1),
});
export type Thresholds = z.infer<typeof Thresholds>;

/** Threshold and state budget for one decision model (§8: thresholds are set per implementation and kind). */
export const DecisionModelSettings = z.object({
  /** Default threshold; `thresholds` overrides it per question kind. */
  threshold: z.number().min(0).max(1),
  thresholds: Thresholds.partial().optional(),
  state_limit_tokens: z.number().int().positive(),
});
export type DecisionModelSettings = z.infer<typeof DecisionModelSettings>;

/**
 * The `decider` role. With provider `jev` it is the jev decision model; with any language-model
 * provider it is the LLM stand-in (§8). The threshold fields here apply unless `decision_models`
 * holds an entry for the chosen model, so switching models picks up that model's own threshold.
 */
export const DeciderRoleConfig = LlmRoleConfig.extend(DecisionModelSettings.shape);
export type DeciderRoleConfig = z.infer<typeof DeciderRoleConfig>;

export const ChatRoleConfig = LlmRoleConfig.extend({
  /** Models the chat-box selector offers. Each is `model` or listed under some provider's `models`. */
  choices: z.array(z.string().min(1)).min(1),
});
export type ChatRoleConfig = z.infer<typeof ChatRoleConfig>;

export const ModelPrice = z.object({
  input_per_mtok: z.number().min(0),
  output_per_mtok: z.number().min(0),
  cache_read_per_mtok: z.number().min(0),
  cache_write_per_mtok: z.number().min(0),
  long_context_over_tokens: z.number().int().positive().nullable(),
  /** Input multiplier for a whole request above `long_context_over_tokens`. */
  long_context_multiplier: z.number().positive().nullable(),
  /** Output multiplier above the same threshold; `long_context_multiplier` when absent. */
  long_context_output_multiplier: z.number().positive().nullable().optional(),
});
export type ModelPrice = z.infer<typeof ModelPrice>;

/** Provider settings (base URL, limits, the models Settings offers). Keys never live here: Credential Manager only. */
export const ProviderConfig = z
  .object({
    base_url: z.string().url().optional(),
    max_concurrency: z.number().int().positive().optional(),
    /** Model IDs the Settings picker offers for this provider. */
    models: z.array(z.string().min(1)).optional(),
  })
  .catchall(z.unknown())
  .superRefine((cfg, ctx) => {
    for (const key of Object.keys(cfg)) {
      if (/^(api[_-]?key|key|secret|client[_-]?secret|password|access[_-]?token|bearer[_-]?token|token)$/i.test(key)) {
        ctx.addIssue({ code: "custom", path: [key], message: "credentials belong in Windows Credential Manager, not models.json" });
      }
    }
  });
export type ProviderConfig = z.infer<typeof ProviderConfig>;

/** Per-model corrections to an adapter's capabilities record (e.g. a model without effort levels). */
export const CapabilityOverride = z.object({
  json_schema: z.boolean().optional(),
  prompt_cache: z.boolean().optional(),
  effort_levels: z.array(z.string()).optional(),
  streaming: z.boolean().optional(),
  usage_reporting: z.boolean().optional(),
  max_context: z.number().int().positive().optional(),
  max_output: z.number().int().positive().optional(),
});
export type CapabilityOverride = z.infer<typeof CapabilityOverride>;

export const ModelsConfig = z
  .object({
    roles: z.object({
      drafter: LlmRoleConfig,
      worker: LlmRoleConfig,
      extractor: LlmRoleConfig,
      decider: DeciderRoleConfig,
      chat: ChatRoleConfig,
    }),
    providers: z.record(z.string(), ProviderConfig),
    prices: z.record(z.string(), ModelPrice),
    /** Threshold and state limit per decision model, keyed by model ID. */
    decision_models: z.record(z.string(), DecisionModelSettings).optional(),
    capabilities: z.record(z.string(), CapabilityOverride).optional(),
  })
  .superRefine((cfg, ctx) => {
    for (const [role, rc] of Object.entries(cfg.roles)) {
      if (!(rc.provider in cfg.providers)) {
        ctx.addIssue({
          code: "custom",
          path: ["roles", role, "provider"],
          message: `provider "${rc.provider}" is not in providers`,
        });
      }
      if (!(rc.model in cfg.prices)) {
        ctx.addIssue({
          code: "custom",
          path: ["roles", role, "model"],
          message: `model "${rc.model}" has no prices row`,
        });
      }
    }
    for (const [i, model] of cfg.roles.chat.choices.entries()) {
      if (!(model in cfg.prices)) {
        ctx.addIssue({ code: "custom", path: ["roles", "chat", "choices", i], message: `model "${model}" has no prices row` });
      }
      const listed = Object.values(cfg.providers).some((p) => p.models?.includes(model));
      if (model !== cfg.roles.chat.model && !listed) {
        ctx.addIssue({
          code: "custom",
          path: ["roles", "chat", "choices", i],
          message: `model "${model}" is not listed under any provider's models`,
        });
      }
    }
  });
export type ModelsConfig = z.infer<typeof ModelsConfig>;
