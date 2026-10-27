-- Spark — initial schema (D1 / SQLite)

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS profiles (
  user_id           TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  age               INTEGER NOT NULL CHECK (age >= 18 AND age <= 120),
  gender            TEXT NOT NULL DEFAULT '',
  city              TEXT NOT NULL DEFAULT '',
  lat               REAL,
  lng               REAL,
  bio               TEXT NOT NULL DEFAULT '',
  intent            TEXT NOT NULL DEFAULT 'casual',
  seeking           TEXT NOT NULL DEFAULT '[]',   -- JSON array of genders
  interests         TEXT NOT NULL DEFAULT '[]',   -- JSON array of strings
  photos            TEXT NOT NULL DEFAULT '[]',   -- JSON array of R2 object keys
  visible           INTEGER NOT NULL DEFAULT 1,   -- 1 = shown in discover
  onboarded         INTEGER NOT NULL DEFAULT 0,   -- 1 = profile complete
  age_min           INTEGER NOT NULL DEFAULT 18,
  age_max           INTEGER NOT NULL DEFAULT 60,
  max_distance_km   INTEGER NOT NULL DEFAULT 100,
  -- Demo seed only: reciprocal likes so a fresh visitor can see a match.
  demo_auto_like    INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS swipes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  swiper_id   TEXT NOT NULL,
  target_id   TEXT NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('like','pass','super')),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (swiper_id, target_id)
);
CREATE INDEX IF NOT EXISTS idx_swipes_target ON swipes (target_id, kind);

CREATE TABLE IF NOT EXISTS matches (
  id          TEXT PRIMARY KEY,
  member_low  TEXT NOT NULL,          -- min(a,b) — makes UNIQUE(a,b) order-independent
  member_high TEXT NOT NULL,
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (member_low, member_high)
);
CREATE INDEX IF NOT EXISTS idx_matches_low  ON matches (member_low, active);
CREATE INDEX IF NOT EXISTS idx_matches_high ON matches (member_high, active);

CREATE TABLE IF NOT EXISTS messages (
  id          TEXT PRIMARY KEY,
  match_id    TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  sender_id   TEXT NOT NULL,
  body        TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  read_at     TEXT
);
CREATE INDEX IF NOT EXISTS idx_messages_match ON messages (match_id, created_at);

CREATE TABLE IF NOT EXISTS blocks (
  blocker_id  TEXT NOT NULL,
  blocked_id  TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (blocker_id, blocked_id)
);

CREATE TABLE IF NOT EXISTS reports (
  id          TEXT PRIMARY KEY,
  reporter_id TEXT NOT NULL,
  target_id   TEXT NOT NULL,
  reason      TEXT NOT NULL,
  details     TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_reports_target ON reports (target_id);
