// Menu drawer (spec 03 §2): slides in from the left over a light scrim. Holds Applications
// (New application and the list), Export and Settings. Escape, the scrim or the close icon close it.
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import type { ApplicationListItem } from "../state/workspace";
import { CloseIcon, PlusIcon, SettingsIcon } from "./icons";

export interface GrantChoice {
  id: string;
  name: string;
}

interface Props {
  open: boolean;
  applications: ApplicationListItem[];
  currentId: string | null;
  grants: GrantChoice[];
  onClose: () => void;
  onOpenApplication: (id: string) => void;
  onCreate: (packageId: string, clientName: string) => Promise<void>;
  onExport: (format: "docx" | "pdf") => void;
  onSettings: () => void;
}

export function Drawer(props: Props) {
  const { open, applications, currentId, grants, onClose, onOpenApplication, onExport, onSettings } = props;
  const panel = useRef<HTMLDivElement>(null);
  const [creating, setCreating] = useState(false);
  const newButton = useRef<HTMLButtonElement>(null);

  // Move focus in on open; keep Tab inside while open.
  useEffect(() => {
    if (!open) {
      setCreating(false);
      return;
    }
    const first = panel.current?.querySelector<HTMLElement>("[data-autofocus]");
    first?.focus();
  }, [open]);

  // Escape closes the drawer even if focus has left it.
  useEffect(() => {
    if (!open) return;
    const onDocKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) onClose();
    };
    document.addEventListener("keydown", onDocKey);
    return () => document.removeEventListener("keydown", onDocKey);
  }, [open, onClose]);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key !== "Tab" || !panel.current) return;
    const focusable = [...panel.current.querySelectorAll<HTMLElement>("button:not(:disabled), input, select")];
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const hasApp = currentId !== null;

  return (
    <>
      <div className="scrim" data-open={open} aria-hidden="true" onClick={onClose} />
      <div
        ref={panel}
        className="drawer"
        data-open={open}
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        inert={!open}
        onKeyDown={onKeyDown}
        data-testid="drawer"
      >
        <div className="drawer-head">
          <span className="drawer-title">Grant Workbench</span>
          <button type="button" className="icon-button" aria-label="Close menu" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>
        <div className="drawer-body">
          <div className="drawer-group">
            <div className="drawer-label">Applications</div>
            <button
              ref={newButton}
              type="button"
              className="drawer-item drawer-item-icon"
              aria-expanded={creating}
              data-autofocus
              onClick={() => setCreating((c) => !c)}
            >
              <PlusIcon />
              New application
            </button>
            {creating && (
              <NewApplication
                grants={grants}
                onCreate={props.onCreate}
                onCancel={() => {
                  setCreating(false);
                  newButton.current?.focus();
                }}
              />
            )}
            {applications.map((a) => (
              <button
                key={a.id}
                type="button"
                className="drawer-item"
                aria-current={a.id === currentId ? "true" : undefined}
                onClick={() => onOpenApplication(a.id)}
              >
                <span>{a.clientName}</span>
                <span className="drawer-tag">{a.grant}</span>
              </button>
            ))}
          </div>
          <div className="rule drawer-rule" aria-hidden="true" />
          <div className="drawer-group">
            <div className="drawer-label">Export application</div>
            <button type="button" className="drawer-item" disabled={!hasApp} onClick={() => onExport("docx")}>
              <span>Export as Word</span>
              <span className="drawer-tag">.docx</span>
            </button>
            <button type="button" className="drawer-item" disabled={!hasApp} onClick={() => onExport("pdf")}>
              <span>Export as PDF</span>
              <span className="drawer-tag">.pdf</span>
            </button>
          </div>
          <div className="rule drawer-rule" aria-hidden="true" />
          <button type="button" className="drawer-item drawer-item-icon" onClick={onSettings}>
            <SettingsIcon />
            Settings
          </button>
        </div>
      </div>
    </>
  );
}

function NewApplication({
  grants,
  onCreate,
  onCancel,
}: {
  grants: GrantChoice[];
  onCreate: (packageId: string, clientName: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [grant, setGrant] = useState(grants[0]?.id ?? "");
  const [client, setClient] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!grant && grants[0]) setGrant(grants[0].id);
  }, [grants, grant]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!grant || !client.trim()) return;
    setBusy(true);
    setFailed(false);
    try {
      await onCreate(grant, client.trim());
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="add-card drawer-form"
      aria-label="New application"
      onSubmit={submit}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          onCancel();
        }
      }}
    >
      <label className="add-label" htmlFor="new-grant">
        Grant
      </label>
      <select id="new-grant" className="text-input" value={grant} onChange={(e) => setGrant(e.target.value)}>
        {grants.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
      </select>
      <label className="add-label" htmlFor="new-client">
        Client
      </label>
      <input
        id="new-client"
        className="text-input"
        value={client}
        onChange={(e) => setClient(e.target.value)}
        autoComplete="off"
        autoFocus
      />
      {failed && <span className="form-error">Couldn't create the application</span>}
      <button type="submit" className="button button-primary" disabled={busy || !grant || !client.trim()}>
        Create
      </button>
    </form>
  );
}
