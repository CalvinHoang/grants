// Per-application SQLite database `.workbench/workbench.db` (build spec §5.3), on the built-in
// node:sqlite in WAL mode (§4.1, §10.4). Migrations are append-only: never edit a shipped one, add
// the next. `PRAGMA user_version` records how far a database has been migrated.
import type { DatabaseSync as DatabaseSyncClass } from "node:sqlite";

export type Database = DatabaseSyncClass;

/** Loaded through getBuiltinModule so bundlers leave it alone (the engine is bundled with esbuild). */
function sqlite(): { DatabaseSync: typeof DatabaseSyncClass } {
  return process.getBuiltinModule("node:sqlite") as { DatabaseSync: typeof DatabaseSyncClass };
}

export interface Migration {
  version: number;
  name: string;
  sql: string;
}

// Shapes mirror @gw/shared data.ts. Passages store a paragraph span, not text: passage text is
// always read from paragraphs.text (§5.4 verbatim rule); only advisor notes carry their own words.
export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: "initial schema",
    sql: `
      CREATE TABLE meta (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      ) STRICT;

      CREATE TABLE documents (
        id        TEXT PRIMARY KEY,
        name      TEXT NOT NULL,
        location  TEXT NOT NULL,
        origin    TEXT NOT NULL CHECK (origin IN ('local', 'sharepoint', 'reference', 'grant')),
        format    TEXT NOT NULL CHECK (format IN ('pdf', 'docx', 'xlsx', 'md', 'txt')),
        sha256    TEXT NOT NULL,
        type      TEXT,
        party     TEXT,
        pages     INTEGER,
        status    TEXT NOT NULL CHECK (status IN ('pending', 'indexed', 'no-text', 'error')),
        added_at  TEXT NOT NULL
      ) STRICT;
      CREATE INDEX documents_sha256 ON documents (sha256);

      CREATE TABLE paragraphs (
        id           TEXT PRIMARY KEY,
        document_id  TEXT NOT NULL REFERENCES documents (id) ON DELETE CASCADE,
        ordinal      INTEGER NOT NULL,
        page         INTEGER,
        sheet        TEXT,
        row          INTEGER,
        char_start   INTEGER NOT NULL,
        char_end     INTEGER NOT NULL,
        bbox         TEXT,
        text         TEXT NOT NULL,
        UNIQUE (document_id, ordinal)
      ) STRICT;

      CREATE TABLE passages (
        id             TEXT PRIMARY KEY,
        origin         TEXT NOT NULL CHECK (origin IN ('digest', 'advisor-note', 'advisor-added')),
        document_id    TEXT REFERENCES documents (id) ON DELETE CASCADE,
        first_ordinal  INTEGER,
        last_ordinal   INTEGER,
        note_text      TEXT,
        note_author    TEXT,
        created_at     TEXT NOT NULL,
        CHECK (
          (origin = 'advisor-note' AND document_id IS NULL AND note_text IS NOT NULL)
          OR (origin <> 'advisor-note' AND document_id IS NOT NULL AND note_text IS NULL
              AND first_ordinal IS NOT NULL AND last_ordinal >= first_ordinal)
        )
      ) STRICT;

      CREATE TABLE passage_links (
        passage_id  TEXT NOT NULL REFERENCES passages (id) ON DELETE CASCADE,
        row_id      TEXT NOT NULL,
        p_supports  REAL CHECK (p_supports IS NULL OR (p_supports >= 0 AND p_supports <= 1)),
        status      TEXT NOT NULL CHECK (status IN ('confirmed', 'suggested', 'advisor-added', 'rejected')),
        PRIMARY KEY (passage_id, row_id)
      ) STRICT;
      CREATE INDEX passage_links_row ON passage_links (row_id);

      CREATE TABLE fields (
        field_id               TEXT PRIMARY KEY,
        state                  TEXT NOT NULL CHECK (state IN ('queued', 'waiting_for_passages', 'drafting',
                                 'reviewing', 'assessing', 'deciding', 'final', 'final_with_flags', 'failed')),
        pass_count             INTEGER NOT NULL DEFAULT 0 CHECK (pass_count BETWEEN 0 AND 5),
        fingerprint            TEXT,
        final_text_ref         TEXT,
        edited_since_assessed  INTEGER NOT NULL DEFAULT 0 CHECK (edited_since_assessed IN (0, 1)),
        inputs_changed         INTEGER NOT NULL DEFAULT 0 CHECK (inputs_changed IN (0, 1)),
        updated_at             TEXT NOT NULL
      ) STRICT;

      CREATE TABLE sentences (
        field_id     TEXT NOT NULL REFERENCES fields (field_id) ON DELETE CASCADE,
        ordinal      INTEGER NOT NULL,
        text         TEXT NOT NULL,
        passage_ids  TEXT NOT NULL DEFAULT '[]',
        row_ids      TEXT NOT NULL DEFAULT '[]',
        connective   INTEGER NOT NULL DEFAULT 0 CHECK (connective IN (0, 1)),
        unsupported  INTEGER NOT NULL DEFAULT 0 CHECK (unsupported IN (0, 1)),
        PRIMARY KEY (field_id, ordinal)
      ) STRICT;

      CREATE TABLE scores (
        id           INTEGER PRIMARY KEY,
        target_kind  TEXT NOT NULL CHECK (target_kind IN ('row', 'overall')),
        field_id     TEXT,
        row_id       TEXT,
        overall_id   TEXT,
        question_id  TEXT NOT NULL,
        question     TEXT NOT NULL,
        model_id     TEXT NOT NULL,
        value_num    REAL,
        value_text   TEXT,
        confidence   REAL,
        pass         INTEGER NOT NULL,
        created_at   TEXT NOT NULL,
        CHECK ((value_num IS NULL) <> (value_text IS NULL))
      ) STRICT;
      CREATE INDEX scores_field ON scores (field_id, row_id);

      CREATE TABLE flags (
        id                    TEXT PRIMARY KEY,
        kind                  TEXT NOT NULL CHECK (kind IN ('below_threshold', 'information_needed', 'conflict',
                                'advisor_decision', 'eligibility_blocker', 'out_of_space', 'to_fill', 'failed')),
        row_ids               TEXT NOT NULL DEFAULT '[]',
        field_ids             TEXT NOT NULL DEFAULT '[]',
        information_required  TEXT,
        why                   TEXT,
        likely_source_party   TEXT,
        blocking              INTEGER NOT NULL DEFAULT 0 CHECK (blocking IN (0, 1)),
        status                TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
        created_at            TEXT NOT NULL,
        resolved_at           TEXT
      ) STRICT;

      CREATE TABLE runs (
        id           TEXT PRIMARY KEY,
        trigger      TEXT NOT NULL CHECK (trigger IN ('run', 'redraft', 'digest', 'consistency')),
        status       TEXT NOT NULL CHECK (status IN ('running', 'paused', 'cancelled', 'completed', 'failed')),
        started_at   TEXT NOT NULL,
        finished_at  TEXT
      ) STRICT;

      CREATE TABLE chat (
        id                  TEXT PRIMARY KEY,
        item_id             TEXT NOT NULL,
        role                TEXT NOT NULL CHECK (role IN ('advisor', 'assistant')),
        text                TEXT NOT NULL,
        created_at          TEXT NOT NULL,
        used_in_redraft_id  TEXT REFERENCES runs (id)
      ) STRICT;
      CREATE INDEX chat_item ON chat (item_id, created_at);

      -- Metadata only, never prompt or response content (§10.3).
      CREATE TABLE calls (
        id                  INTEGER PRIMARY KEY,
        run_id              TEXT REFERENCES runs (id),
        task                TEXT NOT NULL,
        role                TEXT NOT NULL,
        provider            TEXT NOT NULL,
        model_id            TEXT NOT NULL,
        tokens_in           INTEGER NOT NULL,
        tokens_out          INTEGER NOT NULL,
        tokens_cache_read   INTEGER NOT NULL DEFAULT 0,
        tokens_cache_write  INTEGER NOT NULL DEFAULT 0,
        cost_usd            REAL NOT NULL,
        latency_ms          INTEGER NOT NULL,
        request_id          TEXT,
        created_at          TEXT NOT NULL
      ) STRICT;
      CREATE INDEX calls_run ON calls (run_id);
    `,
  },
];

export const LATEST_SCHEMA_VERSION = MIGRATIONS.at(-1)?.version ?? 0;

export class DatabaseTooNewError extends Error {
  constructor(found: number) {
    super(`This application was saved by a newer version of Grant Workbench (database version ${found}).`);
    this.name = "DatabaseTooNewError";
  }
}

function userVersion(db: Database): number {
  const row = db.prepare("PRAGMA user_version").get() as { user_version: number };
  return row.user_version;
}

/** Applies every migration newer than the database, each in its own transaction. Returns the new version. */
export function migrate(db: Database, migrations: readonly Migration[] = MIGRATIONS): number {
  let current = userVersion(db);
  const latest = migrations.at(-1)?.version ?? 0;
  if (current > latest) throw new DatabaseTooNewError(current);
  for (const m of migrations) {
    if (m.version <= current) continue;
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(m.sql);
      // PRAGMA can't take a bound parameter; the version is our own integer.
      db.exec(`PRAGMA user_version = ${Math.trunc(m.version)}`);
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
    current = m.version;
  }
  return current;
}

/** Opens (creating if needed) and migrates an application database. */
export function openDatabase(file: string): Database {
  const { DatabaseSync } = sqlite();
  const db = new DatabaseSync(file);
  try {
    db.exec("PRAGMA journal_mode = WAL");
    db.exec("PRAGMA synchronous = NORMAL");
    db.exec("PRAGMA foreign_keys = ON");
    db.exec("PRAGMA busy_timeout = 5000");
    migrate(db);
  } catch (err) {
    db.close();
    throw err;
  }
  return db;
}

export function getMeta(db: Database, key: string): string | null {
  const row = db.prepare("SELECT value FROM meta WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setMeta(db: Database, key: string, value: string): void {
  db.prepare("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value").run(
    key,
    value,
  );
}
