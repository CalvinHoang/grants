// Usage and cost logging (§7.8, §10.3): one row per provider call in the `calls` table, metadata only.
// There is deliberately no column that could hold prompt or output text.
import type { DatabaseSync } from "node:sqlite";
import { CallRecord, type ModelRole } from "@gw/shared";

export interface CallLog {
  record(call: CallRecord): void;
  summary(recent?: number): { calls: number; costUsd: number; byRole: Partial<Record<ModelRole, number>>; recent: CallRecord[] };
}

const CREATE = `
create table if not exists calls (
  id integer primary key,
  run_id text,
  task text not null,
  role text not null,
  provider text not null,
  model_id text not null,
  tokens_in integer not null,
  tokens_out integer not null,
  tokens_cache_read integer not null,
  tokens_cache_write integer not null,
  cost_usd real not null,
  latency_ms integer not null,
  request_id text,
  created_at text not null
)`;

/** Writes to a `calls` table in the given database (WP-4 points this at each application's workbench.db). */
export class SqliteCallLog implements CallLog {
  readonly #db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.#db = db;
    db.exec(CREATE);
  }

  record(call: CallRecord): void {
    const c = CallRecord.parse(call);
    this.#db
      .prepare(
        `insert into calls (run_id, task, role, provider, model_id, tokens_in, tokens_out, tokens_cache_read,
          tokens_cache_write, cost_usd, latency_ms, request_id, created_at) values (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        c.runId,
        c.task,
        c.role,
        c.provider,
        c.modelId,
        c.tokensIn,
        c.tokensOut,
        c.tokensCacheRead,
        c.tokensCacheWrite,
        c.costUsd,
        c.latencyMs,
        c.requestId,
        c.createdAt,
      );
  }

  summary(recent = 20) {
    const total = this.#db.prepare("select count(*) as n, coalesce(sum(cost_usd), 0) as usd from calls").get() as {
      n: number;
      usd: number;
    };
    const byRoleRows = this.#db.prepare("select role, sum(cost_usd) as usd from calls group by role").all() as {
      role: ModelRole;
      usd: number;
    }[];
    const rows = this.#db
      .prepare(
        `select run_id, task, role, provider, model_id, tokens_in, tokens_out, tokens_cache_read, tokens_cache_write,
          cost_usd, latency_ms, request_id, created_at from calls order by id desc limit ?`,
      )
      .all(recent) as Record<string, unknown>[];
    return {
      calls: Number(total.n),
      costUsd: Number(total.usd),
      byRole: Object.fromEntries(byRoleRows.map((r) => [r.role, Number(r.usd)])),
      recent: rows.map((r) =>
        CallRecord.parse({
          runId: r.run_id,
          task: r.task,
          role: r.role,
          provider: r.provider,
          modelId: r.model_id,
          tokensIn: Number(r.tokens_in),
          tokensOut: Number(r.tokens_out),
          tokensCacheRead: Number(r.tokens_cache_read),
          tokensCacheWrite: Number(r.tokens_cache_write),
          costUsd: Number(r.cost_usd),
          latencyMs: Number(r.latency_ms),
          requestId: r.request_id,
          createdAt: r.created_at,
        }),
      ),
    };
  }
}
