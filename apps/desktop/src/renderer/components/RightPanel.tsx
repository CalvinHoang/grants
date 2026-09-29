// Right panel frame (spec 03 §2): progress line, summary (Overall, then Issues) and the chat
// composer at the bottom. WP-1 lays it out; WP-9 fills item detail, chat and Draft/Redraft.
import { useId, useState } from "react";
import type { ApplicationView, IssueItem, OverallScore } from "../state/workspace";
import { PanelRightIcon, PlusIcon, RedraftIcon, SendIcon } from "./icons";

interface Props {
  view: ApplicationView;
  /** One quiet line while a run is going (spec 03 §4 step 4); null otherwise. */
  progress: string | null;
  selectedIssue: string | null;
  onSelectIssue: (id: string | null) => void;
  /** Models the chat selector lists (models.json chat.choices); hidden until there are any. */
  chatChoices: string[];
  onCollapse: () => void;
}

const pct = (p: number) => `${Math.round(p * 100)}%`;

export function RightPanel({ view, progress, selectedIssue, onSelectIssue, chatChoices, onCollapse }: Props) {
  const issue = view.issues.find((i) => i.id === selectedIssue) ?? null;
  return (
    <aside className="right-panel" aria-label="Strength, evidence and chat" data-testid="right-panel">
      <div className="panel-head">
        <button type="button" className="icon-button" aria-label="Collapse right panel" onClick={onCollapse}>
          <PanelRightIcon />
        </button>
      </div>
      <div className="right-scroll">
        {progress && <div className="progress-line">{progress}</div>}
        {view.overall.length > 0 && <Overall scores={view.overall} />}
        {view.issues.length > 0 && <Issues issues={view.issues} selected={selectedIssue} onSelect={onSelectIssue} />}
      </div>
      <Composer issue={issue} chatChoices={chatChoices} />
    </aside>
  );
}

function Overall({ scores }: { scores: OverallScore[] }) {
  return (
    <section className="summary-block">
      <h2 className="summary-heading">Overall</h2>
      <div className="card overall-card">
        {scores.map((s, i) => (
          <div key={s.label} className="overall-row">
            {i > 0 && <div className="rule" aria-hidden="true" />}
            <div className="overall-top">
              <span className="overall-label">{s.label}</span>
              <span className="overall-value">{pct(s.probability)}</span>
            </div>
            <div
              className="bar"
              role="meter"
              aria-label={s.label}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(s.probability * 100)}
            >
              <div className="bar-fill" style={{ width: pct(s.probability) }} />
            </div>
            <span className="overall-question">{s.question}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function Issues({
  issues,
  selected,
  onSelect,
}: {
  issues: IssueItem[];
  selected: string | null;
  onSelect: (id: string | null) => void;
}) {
  return (
    <section className="summary-block">
      <h2 className="summary-heading">Issues</h2>
      <div className="issue-list">
        {issues.map((issue) => {
          const needed = issue.probability === null;
          return (
            <button
              key={issue.id}
              type="button"
              className="card issue"
              aria-pressed={selected === issue.id}
              onClick={() => onSelect(selected === issue.id ? null : issue.id)}
            >
              <span className="issue-dot" data-kind={needed ? "needed" : "weak"} aria-hidden="true" />
              <span className="issue-body">
                <span className="issue-meta">
                  <span>{issue.ref}</span>
                  {needed ? (
                    <span className="issue-needed">Information needed</span>
                  ) : (
                    <span className="issue-pct">{pct(issue.probability!)}</span>
                  )}
                </span>
                <span className="issue-question">{issue.question}</span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function Composer({ issue, chatChoices }: { issue: IssueItem | null; chatChoices: string[] }) {
  const inputId = useId();
  const [model, setModel] = useState<string | null>(null);
  const draftLabel = issue === null ? "Redraft all" : issue.probability === null ? "Draft" : "Redraft";
  return (
    <div className="composer-wrap">
      <div className="composer">
        {issue && <span className="context-chip">{issue.id}</span>}
        <label htmlFor={inputId} className="visually-hidden">
          Message
        </label>
        <textarea
          id={inputId}
          rows={2}
          className="composer-input"
          placeholder={issue ? "Ask for a revision…" : "Ask about this application…"}
        />
        <div className="composer-row">
          <button type="button" className="icon-button icon-button-sm icon-button-outline" aria-label="Attach">
            <PlusIcon />
          </button>
          <div className="composer-actions">
            {chatChoices.length > 0 && (
              <select
                className="model-select"
                aria-label="Model"
                value={model ?? chatChoices[0]}
                onChange={(e) => setModel(e.target.value)}
              >
                {chatChoices.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            )}
            <button type="button" className="button button-sm">
              <RedraftIcon />
              {draftLabel}
            </button>
            <button type="button" className="icon-button icon-button-sm icon-button-accent" aria-label="Send">
              <SendIcon />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
