/** Idempotent PostgreSQL schema for {@link PostgresControlStore}. */
export const POSTGRES_SCHEMA = `
CREATE TABLE IF NOT EXISTS nominee_actions (
  id text PRIMARY KEY,
  status text NOT NULL,
  version integer NOT NULL,
  capability_hash text UNIQUE,
  record jsonb NOT NULL,
  created_at bigint NOT NULL,
  expires_at bigint NOT NULL
);

CREATE INDEX IF NOT EXISTS nominee_actions_created_at_idx
  ON nominee_actions (created_at DESC);
CREATE INDEX IF NOT EXISTS nominee_actions_expires_at_idx
  ON nominee_actions (expires_at)
  WHERE status NOT IN ('succeeded', 'failed', 'denied', 'expired');

CREATE TABLE IF NOT EXISTS nominee_budgets (
  key text PRIMARY KEY,
  committed bigint NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS nominee_budget_reservations (
  action_id text NOT NULL REFERENCES nominee_actions(id) ON DELETE CASCADE,
  key text NOT NULL REFERENCES nominee_budgets(key) ON DELETE CASCADE,
  limit_value integer NOT NULL,
  state text NOT NULL CHECK (state IN ('reserved', 'committed')),
  expires_at bigint NOT NULL,
  PRIMARY KEY (action_id, key)
);

CREATE INDEX IF NOT EXISTS nominee_budget_reservations_active_idx
  ON nominee_budget_reservations (key, expires_at)
  WHERE state = 'reserved';

CREATE TABLE IF NOT EXISTS nominee_action_events (
  action_id text NOT NULL REFERENCES nominee_actions(id) ON DELETE CASCADE,
  version integer NOT NULL,
  operation text NOT NULL,
  record jsonb NOT NULL,
  at bigint NOT NULL,
  PRIMARY KEY (action_id, version)
);

CREATE TABLE IF NOT EXISTS nominee_receipt_streams (
  stream text PRIMARY KEY,
  next_seq bigint NOT NULL DEFAULT 0,
  prev_hash text NOT NULL DEFAULT 'genesis'
);

CREATE TABLE IF NOT EXISTS nominee_receipts (
  stream text NOT NULL REFERENCES nominee_receipt_streams(stream) ON DELETE CASCADE,
  seq bigint NOT NULL,
  receipt jsonb NOT NULL,
  PRIMARY KEY (stream, seq)
);
`
