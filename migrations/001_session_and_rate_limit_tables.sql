-- TripWise production database setup.
--
-- Run this against the production database once, using a role that may create
-- tables. It is additive and idempotent: every statement is IF NOT EXISTS and
-- nothing is dropped, truncated, or rewritten.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/001_session_and_rate_limit_tables.sql
--
-- Why it exists
-- -------------
-- 1. user_sessions backs express-session through connect-pg-simple. The adapter
--    can create this table itself, but only if the runtime role holds CREATE.
--    Defining it here means the application never depends on that permission and
--    cannot fail authentication on a restricted role.
--    The column names and types must match connect-pg-simple's expected table,
--    which is what its SELECT to_regclass(...) startup check looks for.
--
-- 2. auth_rate_limits stores rate limit counters for the unauthenticated auth
--    endpoints. There is no runtime auto-creation for this table, so without it
--    every limiter silently fails open and the endpoints stay unprotected.
--    Expired rows are deleted by the application.

BEGIN;

CREATE TABLE IF NOT EXISTS user_sessions (
  sid VARCHAR NOT NULL,

  sess JSON NOT NULL,

  expire TIMESTAMP(6) NOT NULL,

  CONSTRAINT user_sessions_pkey
    PRIMARY KEY (sid)
);

CREATE INDEX IF NOT EXISTS IDX_user_sessions_expire
  ON user_sessions(expire);

CREATE TABLE IF NOT EXISTS auth_rate_limits (
  rate_key TEXT PRIMARY KEY,

  total_hits INTEGER
    NOT NULL
    DEFAULT 0,

  reset_at TIMESTAMPTZ
    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_auth_rate_limits_reset_at
  ON auth_rate_limits(reset_at);

COMMIT;