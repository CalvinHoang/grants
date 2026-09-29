// Settings screen skeleton (F-16): Microsoft account, API key per provider, model per role, the
// decision-model threshold, usage to date. WP-1 lays it out and calls the settings.* methods;
// WP-6 serves keys and models, WP-5 the Microsoft sign-in.
import { useEffect, useId, useState, type KeyboardEvent } from "react";
import type { ModelRole, RpcClient } from "@gw/shared";
import { ModelSettings } from "../settings/ModelSettings";
import { CloseIcon } from "./icons";

export interface SettingsData {
  /** Provider ids from models.json. */
  providers: string[];
  /** Model per role from models.json, null until it is loaded. */
  roles: Record<ModelRole, string | null>;
  /** Decider threshold (0–1), null until loaded. */
  threshold: number | null;
  costUsd: number;
  microsoftAccount: string | null;
  /** Models the chat-box selector offers (models.json chat.choices). */
  chatChoices: string[];
}

interface Props {
  client: RpcClient | null;
  data: SettingsData;
  onClose: () => void;
  hasKey: (provider: string) => Promise<boolean>;
  saveKey: (provider: string, key: string) => Promise<void>;
}

const ROLE_LABELS: Record<ModelRole, string> = {
  drafter: "Drafting",
  worker: "Worker",
  extractor: "Extraction",
  decider: "Decision model",
  chat: "Chat",
};

const PROVIDER_LABELS: Record<string, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  jev: "jev",
  copilot: "Microsoft Copilot",
};

const providerLabel = (id: string) => PROVIDER_LABELS[id] ?? id;

export function Settings({ client, data, onClose, hasKey, saveKey }: Props) {
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
    }
  };
  return (
    <div className="settings" role="region" aria-label="Settings" data-testid="settings" onKeyDown={onKeyDown}>
      <div className="settings-inner">
        <div className="settings-head">
          <h1 className="settings-title">Settings</h1>
          <button type="button" className="icon-button" aria-label="Close settings" onClick={onClose} autoFocus>
            <CloseIcon />
          </button>
        </div>

        <section className="settings-section" aria-labelledby="set-ms">
          <h2 id="set-ms" className="settings-heading">
            Microsoft account
          </h2>
          <div className="settings-row">
            <span>{data.microsoftAccount ?? "Not signed in"}</span>
            <button type="button" className="button button-sm" disabled>
              {data.microsoftAccount ? "Sign out" : "Sign in"}
            </button>
          </div>
        </section>

        <section className="settings-section" aria-labelledby="set-keys">
          <h2 id="set-keys" className="settings-heading">
            API keys
          </h2>
          {!client && data.providers.length === 0 && <div className="settings-row settings-muted">—</div>}
          {!client &&
            data.providers.map((p) => <KeyRow key={p} provider={p} hasKey={hasKey} saveKey={saveKey} />)}
        </section>

        <section className="settings-section" aria-labelledby="set-models">
          <h2 id="set-models" className="settings-heading">
            Models
          </h2>
          {(Object.keys(ROLE_LABELS) as ModelRole[]).map((role) => (
            <div key={role} className="settings-row" data-role={role}>
              <span>{ROLE_LABELS[role]}</span>
              <span className="settings-value">{data.roles[role] ?? "—"}</span>
            </div>
          ))}
        </section>

        <section className="settings-section" aria-labelledby="set-threshold">
          <h2 id="set-threshold" className="settings-heading">
            Threshold
          </h2>
          <div className="settings-row">
            <span>Decision model</span>
            <span className="settings-value">{data.threshold === null ? "—" : data.threshold.toFixed(2)}</span>
          </div>
        </section>

        <section className="settings-section" aria-labelledby="set-usage">
          <h2 id="set-usage" className="settings-heading">
            Usage
          </h2>
          <div className="settings-row">
            <span>Cost to date</span>
            <span className="settings-value">US${data.costUsd.toFixed(2)}</span>
          </div>
        </section>

        {client ? <ModelSettings client={client} /> : null}
      </div>
    </div>
  );
}

function KeyRow({
  provider,
  hasKey,
  saveKey,
}: {
  provider: string;
  hasKey: (provider: string) => Promise<boolean>;
  saveKey: (provider: string, key: string) => Promise<void>;
}) {
  const inputId = useId();
  const [present, setPresent] = useState<boolean | null>(null);
  const [value, setValue] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "failed">("idle");

  useEffect(() => {
    let live = true;
    hasKey(provider)
      .then((p) => live && setPresent(p))
      .catch(() => live && setPresent(null));
    return () => {
      live = false;
    };
  }, [provider, hasKey]);

  const save = async () => {
    if (!value) return;
    setState("saving");
    try {
      await saveKey(provider, value);
      setValue("");
      setPresent(true);
      setState("idle");
    } catch {
      setState("failed");
    }
  };

  return (
    <div className="settings-row settings-key" data-provider={provider}>
      <label htmlFor={inputId}>{providerLabel(provider)}</label>
      <div className="settings-key-input">
        <input
          id={inputId}
          type="password"
          className="text-input"
          autoComplete="off"
          spellCheck={false}
          value={value}
          placeholder={present ? "••••••••" : ""}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void save();
          }}
        />
        <button type="button" className="button button-sm" disabled={!value || state === "saving"} onClick={save}>
          Save
        </button>
      </div>
      {state === "failed" && <span className="form-error">Couldn't save the key</span>}
    </div>
  );
}
