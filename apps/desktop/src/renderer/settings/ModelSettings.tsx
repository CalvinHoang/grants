// Settings → models, keys and usage (F-16). Every change is saved to models.json through the engine
// and applies to the next call, with no restart. WP-1 places this inside its settings screen.
import { useCallback, useEffect, useState } from "react";
import type { ModelRole, ModelsConfig, ProviderInfo, RoleTestResult, RpcClient, UsageSummary } from "@gw/shared";

const ROLES: { id: ModelRole; label: string }[] = [
  { id: "drafter", label: "Drafter" },
  { id: "worker", label: "Worker" },
  { id: "extractor", label: "Extractor" },
  { id: "decider", label: "Decider" },
  { id: "chat", label: "Chat" },
];

const PROVIDER_LABELS: Record<string, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  jev: "jev",
  microsoft365: "Microsoft 365 Copilot",
};
const label = (p: string) => PROVIDER_LABELS[p] ?? p;

/** Providers that take an API key (Copilot uses the Microsoft sign-in instead). */
const KEYED = new Set(["anthropic", "openai", "jev"]);

export function ModelSettings({ client }: { client: RpcClient }) {
  const [config, setConfig] = useState<ModelsConfig | null>(null);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tests, setTests] = useState<Partial<Record<ModelRole, RoleTestResult | "running">>>({});
  const [paused, setPaused] = useState<string[]>([]);

  const refresh = useCallback(async () => {
    const [c, p, u] = await Promise.all([
      client.request("settings.getModels", {}),
      client.request("settings.providers", {}),
      client.request("settings.usage", {}),
    ]);
    setConfig(c);
    setProviders(p.providers);
    setUsage(u);
  }, [client]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // A provider's spend cap holds its calls until the advisor raises the cap and resumes (§7.8).
  useEffect(
    () =>
      client.on("error", (e) => {
        if (e.code !== "provider.spend_cap") return;
        const provider = e.message.split(":")[0] ?? "";
        setPaused((p) => (p.includes(provider) ? p : [...p, provider]));
      }),
    [client],
  );

  const resume = async (provider: string) => {
    await client.request("settings.resumeProvider", { provider });
    setPaused((p) => p.filter((x) => x !== provider));
  };

  const save = async (next: ModelsConfig) => {
    try {
      await client.request("settings.setModels", next);
      setError(null);
      setTests({});
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    await refresh();
  };

  if (!config) return <section className="model-settings-live" data-testid="model-settings" aria-busy="true" />;

  const modelsOf = (provider: string) => providers.find((p) => p.id === provider)?.models ?? [];

  const setRole = (role: ModelRole, change: { provider?: string; model?: string; effort?: string }) => {
    const next = structuredClone(config);
    const rc = next.roles[role];
    if (change.provider && change.provider !== rc.provider) {
      rc.provider = change.provider;
      rc.model = modelsOf(change.provider)[0]?.id ?? rc.model;
    }
    if (change.model) rc.model = change.model;
    if (change.effort !== undefined) {
      if (change.effort) rc.effort = change.effort;
      else delete rc.effort;
    }
    const caps = modelsOf(rc.provider).find((m) => m.id === rc.model)?.capabilities;
    if (rc.effort && caps && !caps.effort_levels.includes(rc.effort)) delete rc.effort;
    if (role === "chat" && !next.roles.chat.choices.includes(rc.model)) next.roles.chat.choices.unshift(rc.model);
    void save(next);
  };

  const threshold = config.decision_models?.[config.roles.decider.model]?.threshold ?? config.roles.decider.threshold;
  const setThreshold = (value: number) => {
    if (!Number.isFinite(value) || value < 0 || value > 1) return;
    const next = structuredClone(config);
    const own = next.decision_models?.[next.roles.decider.model];
    if (own) own.threshold = value;
    else next.roles.decider.threshold = value;
    void save(next);
  };

  const test = async (role: ModelRole) => {
    setTests((t) => ({ ...t, [role]: "running" }));
    let r: RoleTestResult;
    try {
      r = await client.request("settings.testRole", { role }, { timeoutMs: 120_000 });
    } catch (e) {
      const rc = config.roles[role];
      r = {
        ok: false,
        role,
        provider: rc.provider,
        modelId: rc.model,
        latencyMs: 0,
        error: { kind: "network", message: e instanceof Error ? e.message : String(e) },
      };
    }
    setTests((t) => ({ ...t, [role]: r }));
    setUsage(await client.request("settings.usage", {}));
  };

  return (
    <section className="model-settings-live" data-testid="model-settings">
      {paused.map((p) => (
        <p key={p} className="settings-error paused" role="alert" data-testid={`paused-${p}`}>
          {label(p)} spend cap reached
          <button type="button" data-testid={`resume-${p}`} onClick={() => void resume(p)}>
            Resume
          </button>
        </p>
      ))}
      <h3>Models</h3>
      <table className="settings-table">
        <tbody>
          {ROLES.map(({ id, label: roleLabel }) => {
            const rc = config.roles[id];
            const caps = modelsOf(rc.provider).find((m) => m.id === rc.model)?.capabilities;
            const t = tests[id];
            return (
              <tr key={id} data-testid={`role-${id}`}>
                <th scope="row">{roleLabel}</th>
                <td>
                  <select
                    aria-label={`${roleLabel} provider`}
                    data-testid={`role-${id}-provider`}
                    value={rc.provider}
                    onChange={(e) => setRole(id, { provider: e.target.value })}
                  >
                    {providers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {label(p.id)}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <select
                    aria-label={`${roleLabel} model`}
                    data-testid={`role-${id}-model`}
                    value={rc.model}
                    onChange={(e) => setRole(id, { model: e.target.value })}
                  >
                    {modelsOf(rc.provider).map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.id}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  {caps && caps.effort_levels.length > 0 ? (
                    <select
                      aria-label={`${roleLabel} effort`}
                      data-testid={`role-${id}-effort`}
                      value={rc.effort ?? ""}
                      onChange={(e) => setRole(id, { effort: e.target.value })}
                    >
                      <option value="">Default</option>
                      {caps.effort_levels.map((lvl) => (
                        <option key={lvl} value={lvl}>
                          {lvl}
                        </option>
                      ))}
                    </select>
                  ) : null}
                </td>
                <td>
                  {id === "decider" ? (
                    <input
                      className="threshold"
                      aria-label="Threshold"
                      data-testid="decider-threshold"
                      type="number"
                      min={0}
                      max={1}
                      step={0.01}
                      defaultValue={threshold}
                      key={`${rc.model}-${threshold}`}
                      onBlur={(e) => setThreshold(Number(e.target.value))}
                    />
                  ) : null}
                </td>
                <td className="test-cell">
                  <button type="button" data-testid={`role-${id}-test`} disabled={t === "running"} onClick={() => void test(id)}>
                    Test
                  </button>
                  {t && t !== "running" ? (
                    <span
                      className={t.ok ? "test-ok" : "test-fail"}
                      data-testid={`role-${id}-result`}
                      data-ok={t.ok}
                      title={t.error?.message}
                    >
                      {t.ok ? `${t.latencyMs} ms` : t.error?.kind.replace("_", " ")}
                    </span>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {error ? (
        <p className="settings-error" role="alert" data-testid="models-error">
          {error}
        </p>
      ) : null}

      <h3>Keys</h3>
      <table className="settings-table">
        <tbody>
          {providers
            .filter((p) => KEYED.has(p.id))
            .map((p) => (
              <KeyRow key={p.id} client={client} provider={p} onChange={refresh} />
            ))}
        </tbody>
      </table>

      <h3>Usage</h3>
      <p className="usage" data-testid="usage-total" data-calls={usage?.calls ?? 0}>
        US${(usage?.costUsd ?? 0).toFixed(4)} · {usage?.calls ?? 0} calls
      </p>
    </section>
  );
}

function KeyRow({ client, provider, onChange }: { client: RpcClient; provider: ProviderInfo; onChange: () => Promise<void> }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const saveKey = async () => {
    if (!value.trim()) return;
    try {
      await client.request("settings.setKey", { provider: provider.id, key: value.trim() });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setValue("");
    await onChange();
  };
  const removeKey = async () => {
    await client.request("settings.deleteKey", { provider: provider.id });
    await onChange();
  };
  return (
    <tr data-testid={`key-${provider.id}`} data-present={provider.hasKey}>
      <th scope="row">{label(provider.id)}</th>
      <td>
        <input
          type="password"
          autoComplete="off"
          spellCheck={false}
          aria-label={`${label(provider.id)} key`}
          data-testid={`key-${provider.id}-input`}
          placeholder={provider.hasKey ? "••••••••" : ""}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void saveKey()}
        />
      </td>
      <td>
        <button type="button" data-testid={`key-${provider.id}-save`} disabled={!value.trim()} onClick={() => void saveKey()}>
          Save
        </button>
        {provider.hasKey ? (
          <button type="button" className="quiet" data-testid={`key-${provider.id}-remove`} onClick={() => void removeKey()}>
            Remove
          </button>
        ) : null}
        {error ? (
          <span className="settings-error key-error" role="alert" data-testid={`key-${provider.id}-error`}>
            {error}
          </span>
        ) : null}
      </td>
    </tr>
  );
}
