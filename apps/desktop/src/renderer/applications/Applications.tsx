// Grant library and applications (F-02, WP-4): New application, the applications list, and the open
// application's requirements table as the engine currently reads it. Self-contained so WP-1's drawer
// and WP-10's table editor can mount or replace these pieces.
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { ApplicationSummary, GrantManifest, RequirementRow, RpcClient } from "@gw/shared";
import "./applications.css";

function message(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong.";
}

export function NewApplication({
  client,
  onCreated,
}: {
  client: RpcClient;
  onCreated: (app: ApplicationSummary) => void;
}) {
  const [grants, setGrants] = useState<GrantManifest[]>([]);
  const [packageId, setPackageId] = useState("");
  const [clientName, setClientName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    client
      .request("project.listGrants", {})
      .then(({ grants }) => {
        if (cancelled) return;
        setGrants(grants);
        setPackageId((current) => current || grants[0]?.id || "");
      })
      .catch((err) => !cancelled && setError(message(err)));
    return () => {
      cancelled = true;
    };
  }, [client]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const app = await client.request("project.create", { packageId, clientName });
      setClientName("");
      onCreated(app);
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="new-application" data-testid="new-application" onSubmit={submit}>
      <h2>New application</h2>
      <label>
        Grant
        <select value={packageId} onChange={(e) => setPackageId(e.target.value)} data-testid="grant-select">
          {grants.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Client name
        <input value={clientName} onChange={(e) => setClientName(e.target.value)} data-testid="client-name" />
      </label>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" disabled={busy || !packageId || !clientName.trim()} data-testid="create-application">
        Create
      </button>
    </form>
  );
}

export function ApplicationList({
  applications,
  currentId,
  onOpen,
}: {
  applications: ApplicationSummary[];
  currentId: string | null;
  onOpen: (id: string) => void;
}) {
  return (
    <nav className="application-list" data-testid="application-list">
      <h2>Applications</h2>
      <ul>
        {applications.map((a) => (
          <li key={a.id}>
            <button type="button" aria-current={a.id === currentId ? "true" : undefined} onClick={() => onOpen(a.id)}>
              {a.name}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function RequirementsView({ client, application }: { client: RpcClient; application: ApplicationSummary }) {
  const [rows, setRows] = useState<RequirementRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    client
      .request("project.requirements", { applicationId: application.id })
      .then(({ rows }) => {
        setRows(rows);
        setError(null);
      })
      .catch((err) => setError(message(err)));
  }, [client, application.id]);

  useEffect(() => {
    load();
    return client.on("table.changed", (e) => {
      if (e.applicationId === application.id && e.table === "requirements") load();
    });
  }, [client, application.id, load]);

  return (
    <section className="requirements" data-testid="requirements">
      <h1 data-testid="application-name">{application.name}</h1>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {rows && (
        <table data-testid="requirements-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Exact guideline wording</th>
              <th>Form field</th>
              <th>Items from client</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} data-row-id={r.id}>
                <td>{r.id}</td>
                <td>{r.wording}</td>
                <td>{r.formField}</td>
                <td>{r.itemsFromClient}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

/** The whole F-02 flow: restores the last open application, lists, creates and switches applications. */
export function Applications({ client }: { client: RpcClient }) {
  const [applications, setApplications] = useState<ApplicationSummary[]>([]);
  const [current, setCurrent] = useState<ApplicationSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const open = useCallback(
    async (id: string) => {
      try {
        setCurrent(await client.request("project.open", { applicationId: id }));
        setError(null);
      } catch (err) {
        setError(message(err));
      }
    },
    [client],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [{ applications }, ui] = await Promise.all([
          client.request("project.list", {}),
          client.request("settings.getUiState", {}),
        ]);
        if (cancelled) return;
        setApplications(applications);
        const last = applications.find((a) => a.id === ui.lastApplicationId);
        if (last) await open(last.id);
      } catch (err) {
        if (!cancelled) setError(message(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client, open]);

  const created = async (app: ApplicationSummary) => {
    setApplications((await client.request("project.list", {})).applications);
    await open(app.id);
  };

  return (
    <div className="applications" data-testid="applications" data-current={current?.id}>
      <aside className="applications-side">
        <NewApplication client={client} onCreated={created} />
        <ApplicationList applications={applications} currentId={current?.id ?? null} onOpen={(id) => void open(id)} />
      </aside>
      <div className="applications-main">
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {current && <RequirementsView key={current.id} client={client} application={current} />}
      </div>
    </div>
  );
}
