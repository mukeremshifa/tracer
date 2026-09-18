// ---------------------------------------------------------------------------
// The decision store.
//
// Every decision Tracer takes, written down, so that "we record every decision"
// is a thing you can query rather than a thing we say. There is no dashboard and
// no approval queue on top of it -- those were cut deliberately (see
// docs/BRIEF-DEMO.md). This is the write path and the read path is a CLI:
//
//   npx tracer log                      the decisions, newest last
//   npx tracer log --sessions           one line per session
//
// Two design commitments, both of which are the point:
//
//   node:sqlite, not better-sqlite3. The repo's claim is "no database, no
//   container, no queue to stand up". A file written by a module that ships
//   inside Node keeps that mostly true, and there is no native build step to
//   break on somebody else's machine. The cost is an ExperimentalWarning, which
//   is cheaper than a compiler.
//
//   Redact before writing. `SECRET_PATTERNS` in session.js already finds the
//   OTP in a tier-1 read; ProxySession hands the values here so they can be
//   masked out of the stored arguments. An audit log that stores the passcode it
//   was protecting is a new vulnerability with a reassuring name.
// ---------------------------------------------------------------------------

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sessions (
  id            TEXT PRIMARY KEY,
  started_at    TEXT NOT NULL,
  goal          TEXT,
  goal_source   TEXT,
  plan_json     TEXT,
  task_declared INTEGER NOT NULL DEFAULT 0,
  config        TEXT
);

CREATE TABLE IF NOT EXISTS decisions (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id         TEXT NOT NULL REFERENCES sessions(id),
  ts                 TEXT NOT NULL,
  tool_name          TEXT NOT NULL,
  tier               INTEGER,
  decision           TEXT NOT NULL,
  rule               TEXT,
  layer              TEXT,
  headline           TEXT,
  explain_json       TEXT,
  chain_json         TEXT,
  destination_json   TEXT,
  args_redacted_json TEXT
);

CREATE INDEX IF NOT EXISTS decisions_session ON decisions(session_id, id);
`;

/**
 * Replace every known secret value with a label naming what it was.
 *
 * Masking rather than dropping: "the arguments contained a one-time passcode" is
 * exactly the fact an auditor needs, and it is the fact the value itself would
 * have told them at the cost of storing it.
 *
 * @param {object} args
 * @param {Array<{value: string, kind: string}>} secrets
 */
export function redactArgs(args, secrets = []) {
  let json = JSON.stringify(args ?? {});
  for (const s of secrets) {
    if (!s || !s.value) continue;
    json = json.split(s.value).join('[redacted ' + (s.kind || 'secret') + ']');
  }
  // Long values are truncated too. A stored 8MB file body is not evidence, it is
  // a copy of the thing the firewall was standing in front of.
  const parsed = JSON.parse(json);
  for (const [k, v] of Object.entries(parsed)) {
    if (typeof v === 'string' && v.length > 2000) {
      parsed[k] = v.slice(0, 2000) + '... [' + v.length + ' chars, truncated]';
    }
  }
  return parsed;
}

/**
 * @param {object} o
 * @param {string} o.path      the sqlite file
 * @param {string} o.sessionId
 * @param {string} [o.config]  which tier config this session ran with
 */
export function createDecisionStore({ path, sessionId, config = null }) {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec(SCHEMA);

  db.prepare(
    'INSERT OR REPLACE INTO sessions (id, started_at, goal, goal_source, plan_json, task_declared, config)' +
      ' VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(sessionId, new Date().toISOString(), null, null, '[]', 0, config);

  const insert = db.prepare(
    'INSERT INTO decisions (session_id, ts, tool_name, tier, decision, rule, layer, headline,' +
      ' explain_json, chain_json, destination_json, args_redacted_json)' +
      ' VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  );

  const touchSession = db.prepare(
    'UPDATE sessions SET goal = ?, goal_source = ?, plan_json = ?, task_declared = ? WHERE id = ?',
  );

  return {
    path,
    sessionId,

    /** @param {object} o */
    session({ goal, goalSource, plan, taskDeclared }) {
      touchSession.run(
        goal || null,
        goalSource || null,
        JSON.stringify(plan || []),
        taskDeclared ? 1 : 0,
        sessionId,
      );
    },

    /**
     * @param {object} call      { name, arguments }
     * @param {object} decision  a core decision
     * @param {Array}  secrets   ctx.secrets, for redaction
     */
    record(call, decision, secrets = []) {
      insert.run(
        sessionId,
        new Date().toISOString(),
        call.name,
        decision.tier ?? null,
        decision.decision,
        decision.rule || null,
        decision.layer || null,
        decision.headline || null,
        JSON.stringify(decision.explain || []),
        JSON.stringify(decision.chain || []),
        decision.destination ? JSON.stringify(decision.destination) : null,
        JSON.stringify(redactArgs(call.arguments, secrets)),
      );
    },

    close() {
      try {
        db.close();
      } catch {
        /* closing anyway */
      }
    },
  };
}

/** Read-only, for `tracer log`. Kept here so the schema has one owner. */
export function readDecisionStore(path, { limit = 200, session = null } = {}) {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    const sessions = db
      .prepare('SELECT * FROM sessions ORDER BY started_at DESC LIMIT 50')
      .all();
    const decisions = session
      ? db
          .prepare('SELECT * FROM decisions WHERE session_id = ? ORDER BY id DESC LIMIT ?')
          .all(session, limit)
      : db.prepare('SELECT * FROM decisions ORDER BY id DESC LIMIT ?').all(limit);
    return { sessions, decisions: decisions.reverse() };
  } finally {
    db.close();
  }
}
