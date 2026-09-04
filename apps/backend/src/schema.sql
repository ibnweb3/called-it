-- Called It backend cache. The chain is the source of truth; everything here is
-- derived and rebuildable. Timestamps are unix seconds.

CREATE TABLE IF NOT EXISTS players (
  address       TEXT PRIMARY KEY,          -- lowercased burner address
  handle        TEXT,
  created_at    INTEGER NOT NULL,
  tg_chat_id    TEXT,                      -- linked Telegram chat, nullable
  notify_rounds INTEGER NOT NULL DEFAULT 0 -- opt-in: DM when a round is about to lock
);

CREATE TABLE IF NOT EXISTS rounds (
  market_id     TEXT PRIMARY KEY,
  asset         TEXT NOT NULL,
  interval_sec  INTEGER NOT NULL,
  opens_at      INTEGER NOT NULL,
  locks_at      INTEGER NOT NULL,
  status        TEXT NOT NULL,             -- listed|trading|locked|settling|resolved|voided
  opening_price REAL,
  closing_price REAL,
  result        TEXT,                      -- UP|DOWN|VOID once settled
  first_seen    INTEGER NOT NULL,
  settled_at    INTEGER
);
CREATE INDEX IF NOT EXISTS idx_rounds_asset_locks ON rounds (asset, locks_at DESC);

CREATE TABLE IF NOT EXISTS calls (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  address    TEXT NOT NULL,
  market_id  TEXT NOT NULL,
  side       TEXT NOT NULL,                -- UP|DOWN
  chip_usd   REAL NOT NULL,
  contracts  REAL NOT NULL,
  spent      REAL NOT NULL,
  avg_price  REAL NOT NULL,
  tx_hash    TEXT,
  room_id    TEXT,
  placed_at  INTEGER NOT NULL,
  outcome    TEXT,                         -- won|lost|void, filled at settlement
  payout     REAL,                         -- contracts (win) / contracts*0.5 (void) / 0
  UNIQUE (address, market_id)
);
CREATE INDEX IF NOT EXISTS idx_calls_market ON calls (market_id);
CREATE INDEX IF NOT EXISTS idx_calls_address ON calls (address, placed_at DESC);

CREATE TABLE IF NOT EXISTS streaks (
  address     TEXT PRIMARY KEY,
  current     INTEGER NOT NULL DEFAULT 0,
  best        INTEGER NOT NULL DEFAULT 0,
  total_calls INTEGER NOT NULL DEFAULT 0,
  total_wins  INTEGER NOT NULL DEFAULT 0,
  net_usd     REAL NOT NULL DEFAULT 0,     -- sum(payout - spent) over settled calls
  updated_at  INTEGER
);

CREATE TABLE IF NOT EXISTS rooms (
  id         TEXT PRIMARY KEY,             -- short slug
  name       TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS room_members (
  room_id   TEXT NOT NULL,
  address   TEXT NOT NULL,
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (room_id, address)
);

-- key/value for indexer bookkeeping (last settled scan cursor, etc.)
CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
