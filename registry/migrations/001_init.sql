-- Axint Registry schema

CREATE TABLE IF NOT EXISTS users (
  id         TEXT PRIMARY KEY,
  github_id  INTEGER NOT NULL UNIQUE,
  username   TEXT NOT NULL,
  avatar_url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tokens (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id),
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT
);

CREATE TABLE IF NOT EXISTS device_codes (
  device_code      TEXT PRIMARY KEY,
  user_code        TEXT NOT NULL UNIQUE,
  client_id        TEXT NOT NULL,
  github_state     TEXT NOT NULL UNIQUE,
  status           TEXT NOT NULL DEFAULT 'pending',
  user_id          TEXT REFERENCES users(id),
  access_token     TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS packages (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  namespace        TEXT NOT NULL,
  slug             TEXT NOT NULL,
  name             TEXT NOT NULL,
  description      TEXT,
  latest_version   TEXT NOT NULL,
  owner_id         TEXT NOT NULL REFERENCES users(id),
  license          TEXT DEFAULT 'Apache-2.0',
  homepage         TEXT,
  repository       TEXT,
  downloads        INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(namespace, slug)
);

CREATE TABLE IF NOT EXISTS versions (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  package_id       INTEGER NOT NULL REFERENCES packages(id),
  version          TEXT NOT NULL,
  ts_source        TEXT NOT NULL,
  py_source        TEXT,
  swift_output     TEXT NOT NULL,
  plist_fragment   TEXT,
  ir               TEXT NOT NULL,
  readme           TEXT,
  tags             TEXT DEFAULT '[]',
  surface_areas    TEXT DEFAULT '[]',
  primary_language TEXT DEFAULT 'typescript',
  siri_phrases     TEXT DEFAULT '[]',
  compiler_version TEXT NOT NULL,
  r2_key           TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(package_id, version)
);

CREATE INDEX IF NOT EXISTS idx_packages_namespace_slug ON packages(namespace, slug);
CREATE INDEX IF NOT EXISTS idx_versions_package_id ON versions(package_id);
CREATE INDEX IF NOT EXISTS idx_tokens_hash ON tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_device_codes_user_code ON device_codes(user_code);
CREATE INDEX IF NOT EXISTS idx_device_codes_github_state ON device_codes(github_state);
