-- Multilevel Speaking Bot schema (PostgreSQL 14+ / Neon). Idempotent: safe to run repeatedly.

CREATE TABLE IF NOT EXISTS users (
  id                   BIGINT PRIMARY KEY,               -- Telegram user id
  username             TEXT,
  first_name           TEXT,
  language_code        TEXT,
  attempts             INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  referred_by          BIGINT REFERENCES users(id),
  ref_qualified        BOOLEAN NOT NULL DEFAULT FALSE,   -- this user has counted towards their referrer
  ref_qualified_count  INTEGER NOT NULL DEFAULT 0,       -- how many of *my* referrals joined the channel
  is_member            BOOLEAN NOT NULL DEFAULT FALSE,   -- last known channel membership
  blocked              BOOLEAN NOT NULL DEFAULT FALSE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS users_referred_by_idx ON users(referred_by);

-- Every change to a user's attempt balance, for auditing and support.
CREATE TABLE IF NOT EXISTS attempt_ledger (
  id           BIGSERIAL PRIMARY KEY,
  user_id      BIGINT NOT NULL REFERENCES users(id),
  delta        INTEGER NOT NULL,
  reason       TEXT NOT NULL,          -- signup_free | referral_reward | mock_start | refund | admin_grant
  ref_user_id  BIGINT,
  session_id   UUID,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS attempt_ledger_user_idx ON attempt_ledger(user_id);

CREATE TABLE IF NOT EXISTS sessions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      BIGINT NOT NULL REFERENCES users(id),
  test_id      TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','grading','done','failed')),
  score        INTEGER,               -- 0..75
  level        TEXT,                  -- Below B1 | B1 | B2 | C1
  result       JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id, created_at DESC);
-- At most one unfinished mock per user (also makes "consume attempt + create session" race-free).
CREATE UNIQUE INDEX IF NOT EXISTS sessions_one_active_idx ON sessions(user_id) WHERE status IN ('in_progress','grading');

CREATE TABLE IF NOT EXISTS answers (
  session_id   UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  step_key     TEXT NOT NULL,         -- e.g. p1_1_2, p1_2_1, p2, p3
  transcript   TEXT NOT NULL,
  metrics      JSONB NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, step_key)
);
