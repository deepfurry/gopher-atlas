-- +goose Up
CREATE TABLE tag_translations (
    tag_id INTEGER NOT NULL REFERENCES tags(id),
    locale TEXT NOT NULL CHECK (locale = 'en'),
    name TEXT NOT NULL CHECK (length(trim(name)) > 0 AND length(name) <= 100),
    description TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 1000),
    PRIMARY KEY (tag_id, locale)
);

CREATE TABLE note_groups (
    id INTEGER PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE CHECK (length(slug) BETWEEN 1 AND 100 AND slug NOT GLOB '*[^a-z0-9-]*' AND substr(slug, 1, 1) != '-' AND substr(slug, -1) != '-' AND instr(slug, '--') = 0),
    name TEXT NOT NULL CHECK (length(trim(name)) > 0 AND length(name) <= 100),
    description TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 1000),
    name_en TEXT NOT NULL DEFAULT '' CHECK (length(name_en) <= 100),
    description_en TEXT NOT NULL DEFAULT '' CHECK (length(description_en) <= 1000),
    sort_order INTEGER NOT NULL DEFAULT 0 CHECK (typeof(sort_order) = 'integer' AND sort_order BETWEEN 0 AND 1000000),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

-- Explicit offline data upgrade is required for an existing publication. A fresh
-- empty installation needs no import. Startup/readiness never populate taxonomy.
CREATE TABLE taxonomy_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    ready INTEGER NOT NULL CHECK (ready IN (0, 1)),
    source_sha256 TEXT NOT NULL DEFAULT ''
);
INSERT INTO taxonomy_state (id, ready)
SELECT 1, CASE WHEN EXISTS (SELECT 1 FROM content_items)
    OR (SELECT publication_generation FROM site_state WHERE id = 1) > 0 THEN 0 ELSE 1 END;

-- +goose StatementBegin
CREATE TRIGGER tags_slug_immutable BEFORE UPDATE OF slug ON tags
WHEN NEW.slug != OLD.slug BEGIN SELECT RAISE(ABORT, 'immutable taxonomy slug'); END;
-- +goose StatementEnd
-- +goose StatementBegin
CREATE TRIGGER note_groups_slug_immutable BEFORE UPDATE OF slug ON note_groups
WHEN NEW.slug != OLD.slug BEGIN SELECT RAISE(ABORT, 'immutable taxonomy slug'); END;
-- +goose StatementEnd
-- +goose StatementBegin
CREATE TRIGGER note_groups_delete_forbidden BEFORE DELETE ON note_groups
BEGIN SELECT RAISE(ABORT, 'permanent taxonomy identity'); END;
-- +goose StatementEnd

CREATE TABLE audit_events_v4 (
    id INTEGER PRIMARY KEY,
    actor_user_id INTEGER NOT NULL REFERENCES users(id),
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL CHECK (entity_type IN ('user', 'author', 'content', 'tag', 'asset', 'publication', 'note_group')),
    entity_id INTEGER NOT NULL CHECK (entity_id > 0),
    revision_id INTEGER REFERENCES content_revisions(id),
    metadata_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metadata_json)),
    request_id TEXT NOT NULL,
    created_at INTEGER NOT NULL
);
INSERT INTO audit_events_v4 SELECT * FROM audit_events;
DROP TABLE audit_events;
ALTER TABLE audit_events_v4 RENAME TO audit_events;
CREATE INDEX audit_actor ON audit_events(actor_user_id, id);
-- +goose StatementBegin
CREATE TRIGGER audit_events_update_forbidden BEFORE UPDATE ON audit_events
BEGIN SELECT RAISE(ABORT, 'immutable history'); END;
-- +goose StatementEnd
-- +goose StatementBegin
CREATE TRIGGER audit_events_delete_forbidden BEFORE DELETE ON audit_events
BEGIN SELECT RAISE(ABORT, 'immutable history'); END;
-- +goose StatementEnd

-- +goose Down
-- Never erase translations, imported groups, upgrade state, or new Audit history.
CREATE TABLE taxonomy_down_guard (value INTEGER CHECK (value = 0));
INSERT INTO taxonomy_down_guard SELECT count(*) FROM note_groups;
INSERT INTO taxonomy_down_guard SELECT count(*) FROM tag_translations;
INSERT INTO taxonomy_down_guard SELECT count(*) FROM taxonomy_state WHERE source_sha256 != '';
INSERT INTO taxonomy_down_guard SELECT count(*) FROM audit_events WHERE entity_type = 'note_group';
DROP TABLE taxonomy_down_guard;

CREATE TABLE audit_events_v3 (
    id INTEGER PRIMARY KEY,
    actor_user_id INTEGER NOT NULL REFERENCES users(id),
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL CHECK (entity_type IN ('user', 'author', 'content', 'tag', 'asset', 'publication')),
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
DROP TRIGGER tags_slug_immutable;
DROP TABLE tag_translations;
DROP TABLE note_groups;
DROP TABLE taxonomy_state;
