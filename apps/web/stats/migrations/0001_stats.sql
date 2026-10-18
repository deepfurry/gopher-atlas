-- Independent statistics archive. Never apply this to the CMS SQLite database.
CREATE TABLE daily_site_traffic (
  day_utc TEXT PRIMARY KEY CHECK (day_utc GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  page_loads REAL NOT NULL CHECK (page_loads >= 0),
  visits REAL NOT NULL CHECK (visits >= 0),
  sample_min REAL CHECK (sample_min >= 1),
  sample_max REAL CHECK (sample_max >= sample_min),
  bot_filter TEXT NOT NULL CHECK (bot_filter = 'unverified'),
  quality_state TEXT NOT NULL CHECK (quality_state IN ('observed','sampled-estimate','partial')),
  archive_at TEXT NOT NULL,
  source_window TEXT NOT NULL
);
CREATE TABLE daily_page_traffic (
  day_utc TEXT NOT NULL,
  canonical_public_path TEXT NOT NULL,
  page_loads REAL NOT NULL CHECK (page_loads >= 0),
  quality_state TEXT NOT NULL CHECK (quality_state = 'observed'),
  archive_at TEXT NOT NULL,
  PRIMARY KEY (day_utc, canonical_public_path)
);
CREATE TABLE daily_referrers (
  day_utc TEXT NOT NULL,
  source_key TEXT NOT NULL CHECK (source_key IN ('direct-unknown','search','external-other')),
  visits REAL NOT NULL CHECK (visits >= 0),
  quality_state TEXT NOT NULL CHECK (quality_state = 'observed'),
  archive_at TEXT NOT NULL,
  PRIMARY KEY (day_utc, source_key)
);
CREATE TABLE daily_dimensions (
  day_utc TEXT NOT NULL,
  dimension TEXT NOT NULL CHECK (dimension IN ('site','pages','referrers')),
  last_attempt_at TEXT NOT NULL,
  last_success_at TEXT,
  last_result TEXT NOT NULL CHECK (last_result IN ('complete','partial','unavailable')),
  PRIMARY KEY (day_utc, dimension)
);
CREATE TABLE daily_content_counts (
  day_utc TEXT PRIMARY KEY,
  notes INTEGER NOT NULL CHECK (notes >= 0),
  curated_articles INTEGER NOT NULL CHECK (curated_articles >= 0),
  topics INTEGER NOT NULL CHECK (topics >= 0),
  tags INTEGER NOT NULL CHECK (tags >= 0),
  snapshot_generation INTEGER NOT NULL CHECK (snapshot_generation > 0),
  observed_at TEXT NOT NULL
);
CREATE TABLE sync_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_at TEXT NOT NULL,
  day_utc TEXT NOT NULL,
  result TEXT NOT NULL CHECK (result IN ('success','partial','failed')),
  site_state TEXT NOT NULL,
  pages_state TEXT NOT NULL,
  referrers_state TEXT NOT NULL,
  error_code TEXT CHECK (error_code IS NULL OR error_code IN ('upstream_unavailable','storage_unavailable','manifest_unavailable','invalid_input')),
  duration_ms INTEGER NOT NULL CHECK (duration_ms >= 0),
  rerun INTEGER NOT NULL CHECK (rerun IN (0,1)),
  contract_version INTEGER NOT NULL CHECK (contract_version = 1)
);
