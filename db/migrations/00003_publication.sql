-- +goose Up
CREATE TABLE assets (
    id INTEGER PRIMARY KEY,
    sha256 TEXT NOT NULL UNIQUE CHECK (length(sha256)=64 AND sha256 NOT GLOB '*[^0-9a-f]*'),
    object_key TEXT NOT NULL UNIQUE,
    mime_type TEXT NOT NULL CHECK (mime_type IN ('image/png','image/jpeg','image/webp','image/gif')),
    byte_size INTEGER NOT NULL CHECK (byte_size > 0 AND byte_size <= 10485760),
    width INTEGER NOT NULL CHECK (width > 0 AND width <= 16384),
    height INTEGER NOT NULL CHECK (height > 0 AND height <= 16384),
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at INTEGER NOT NULL,
    deleted_at INTEGER,
    CHECK (width * height <= 100000000)
);
CREATE INDEX assets_selection ON assets(deleted_at, id);
ALTER TABLE content_drafts ADD COLUMN cover_asset_id INTEGER REFERENCES assets(id);
ALTER TABLE content_revisions ADD COLUMN cover_asset_id INTEGER REFERENCES assets(id);

CREATE TABLE site_state (
    id INTEGER PRIMARY KEY CHECK (id=1),
    publication_generation INTEGER NOT NULL CHECK (publication_generation >= 0 AND publication_generation <= 9007199254740991),
    updated_at INTEGER NOT NULL
);
INSERT INTO site_state(id, publication_generation, updated_at) VALUES (1,0,0);
CREATE TABLE publication_jobs (
    id INTEGER PRIMARY KEY,
    generation INTEGER NOT NULL UNIQUE CHECK (generation > 0 AND generation <= 9007199254740991),
    state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','snapshot_uploaded','build_triggered','failed','superseded')),
    snapshot_key TEXT,
    snapshot_sha256 TEXT CHECK (snapshot_sha256 IS NULL OR (length(snapshot_sha256)=64 AND snapshot_sha256 NOT GLOB '*[^0-9a-f]*')),
    attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    last_error TEXT NOT NULL DEFAULT '' CHECK (last_error IN ('','storage_unavailable','storage_integrity_error','snapshot_invalid','build_trigger_failed','dependency_unavailable')),
    next_attempt_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    triggered_at INTEGER,
    CHECK ((snapshot_key IS NULL) = (snapshot_sha256 IS NULL)),
    CHECK (state NOT IN ('snapshot_uploaded','build_triggered') OR snapshot_key IS NOT NULL),
    CHECK ((state='build_triggered') = (triggered_at IS NOT NULL))
);
CREATE INDEX publication_actionable ON publication_jobs(state, next_attempt_at, generation);

-- No table references Audit. Copy every row before replacing its CHECK constraint.
CREATE TABLE audit_events_v3 (
    id INTEGER PRIMARY KEY,
    actor_user_id INTEGER NOT NULL REFERENCES users(id),
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL CHECK (entity_type IN ('user','author','content','tag','asset','publication')),
    entity_id INTEGER NOT NULL CHECK (entity_id > 0),
    revision_id INTEGER REFERENCES content_revisions(id),
    metadata_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metadata_json)),
    request_id TEXT NOT NULL,
    created_at INTEGER NOT NULL
);
INSERT INTO audit_events_v3 SELECT * FROM audit_events;
DROP TABLE audit_events;
ALTER TABLE audit_events_v3 RENAME TO audit_events;
CREATE INDEX audit_actor ON audit_events(actor_user_id, id);
-- +goose StatementBegin
CREATE TRIGGER audit_events_update_forbidden BEFORE UPDATE ON audit_events
BEGIN SELECT RAISE(ABORT, 'immutable history'); END;
-- +goose StatementEnd
-- +goose StatementBegin
CREATE TRIGGER audit_events_delete_forbidden BEFORE DELETE ON audit_events
BEGIN SELECT RAISE(ABORT, 'immutable history'); END;
-- +goose StatementEnd
-- +goose StatementBegin
CREATE TRIGGER asset_identity_immutable BEFORE UPDATE OF sha256, object_key, mime_type, byte_size, width, height, created_by, created_at ON assets
BEGIN SELECT RAISE(ABORT, 'immutable asset identity'); END;
-- +goose StatementEnd
-- +goose StatementBegin
CREATE TRIGGER asset_delete_forbidden BEFORE DELETE ON assets
BEGIN SELECT RAISE(ABORT, 'assets are soft deleted'); END;
-- +goose StatementEnd

-- +goose Down
-- Refuse a downgrade that cannot retain P0-4 Audit history in the v2 constraint.
CREATE TABLE publication_down_guard (value INTEGER CHECK (value=0));
INSERT INTO publication_down_guard SELECT count(*) FROM audit_events WHERE entity_type IN ('asset','publication');
DROP TABLE publication_down_guard;
CREATE TABLE audit_events_v2 (
    id INTEGER PRIMARY KEY,
    actor_user_id INTEGER NOT NULL REFERENCES users(id),
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL CHECK (entity_type IN ('user','author','content','tag')),
    entity_id INTEGER NOT NULL CHECK (entity_id > 0),
    revision_id INTEGER REFERENCES content_revisions(id),
    metadata_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metadata_json)),
    request_id TEXT NOT NULL,
    created_at INTEGER NOT NULL
);
INSERT INTO audit_events_v2 SELECT * FROM audit_events;
DROP TABLE audit_events;
ALTER TABLE audit_events_v2 RENAME TO audit_events;
CREATE INDEX audit_actor ON audit_events(actor_user_id, id);
-- +goose StatementBegin
CREATE TRIGGER audit_events_update_forbidden BEFORE UPDATE ON audit_events
BEGIN SELECT RAISE(ABORT, 'immutable history'); END;
-- +goose StatementEnd
-- +goose StatementBegin
CREATE TRIGGER audit_events_delete_forbidden BEFORE DELETE ON audit_events
BEGIN SELECT RAISE(ABORT, 'immutable history'); END;
-- +goose StatementEnd
DROP TABLE publication_jobs;
DROP TABLE site_state;
ALTER TABLE content_revisions DROP COLUMN cover_asset_id;
ALTER TABLE content_drafts DROP COLUMN cover_asset_id;
DROP TABLE assets;
