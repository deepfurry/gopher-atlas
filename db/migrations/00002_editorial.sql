-- +goose Up
CREATE TABLE content_items (
    id INTEGER PRIMARY KEY,
    type TEXT NOT NULL CHECK (type IN ('curated_article','post','note','topic')),
    owner_user_id INTEGER NOT NULL REFERENCES users(id),
    editorial_state TEXT NOT NULL DEFAULT 'draft' CHECK (editorial_state IN ('draft','in_review','changes_requested','synced')),
    pending_review_revision_id INTEGER,
    published_revision_id INTEGER,
    created_by INTEGER NOT NULL REFERENCES users(id),
    first_published_at INTEGER,
    last_published_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    archived_at INTEGER,
    CHECK ((editorial_state = 'in_review') = (pending_review_revision_id IS NOT NULL)),
    CHECK (archived_at IS NULL OR (published_revision_id IS NULL AND pending_review_revision_id IS NULL AND editorial_state = 'draft'))
);
CREATE INDEX content_owner ON content_items(owner_user_id, id);
CREATE INDEX content_review_queue ON content_items(editorial_state, id);

CREATE TABLE content_drafts (
    content_id INTEGER PRIMARY KEY REFERENCES content_items(id),
    version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
    title TEXT NOT NULL DEFAULT '',
    slug TEXT NOT NULL DEFAULT '',
    summary TEXT NOT NULL DEFAULT '',
    body_markdown TEXT NOT NULL DEFAULT '',
    byline_user_id INTEGER NOT NULL REFERENCES users(id),
    language TEXT NOT NULL DEFAULT '',
    featured INTEGER NOT NULL DEFAULT 0 CHECK (featured IN (0,1)),
    seo_title TEXT NOT NULL DEFAULT '',
    seo_description TEXT NOT NULL DEFAULT '',
    payload_schema_version INTEGER NOT NULL CHECK (payload_schema_version = 1),
    payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
    updated_by INTEGER NOT NULL REFERENCES users(id),
    updated_at INTEGER NOT NULL
);
CREATE TABLE content_revisions (
    id INTEGER PRIMARY KEY,
    content_id INTEGER NOT NULL REFERENCES content_items(id),
    revision_no INTEGER NOT NULL CHECK (revision_no >= 1),
    title TEXT NOT NULL DEFAULT '',
    slug TEXT NOT NULL DEFAULT '',
    summary TEXT NOT NULL DEFAULT '',
    body_markdown TEXT NOT NULL DEFAULT '',
    byline_user_id INTEGER NOT NULL REFERENCES users(id),
    language TEXT NOT NULL DEFAULT '',
    featured INTEGER NOT NULL DEFAULT 0 CHECK (featured IN (0,1)),
    seo_title TEXT NOT NULL DEFAULT '',
    seo_description TEXT NOT NULL DEFAULT '',
    payload_schema_version INTEGER NOT NULL CHECK (payload_schema_version = 1),
    payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at INTEGER NOT NULL,
    UNIQUE(content_id, revision_no),
    UNIQUE(content_id, id)
);
CREATE TABLE content_reviews (
    id INTEGER PRIMARY KEY,
    content_id INTEGER NOT NULL REFERENCES content_items(id),
    revision_id INTEGER NOT NULL UNIQUE,
    reviewer_user_id INTEGER NOT NULL REFERENCES users(id),
    decision TEXT NOT NULL CHECK (decision IN ('changes_requested','approved')),
    comment_markdown TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (content_id, revision_id) REFERENCES content_revisions(content_id, id)
);
CREATE INDEX reviews_content ON content_reviews(content_id, id);

CREATE TABLE tags (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    normalized_name TEXT NOT NULL UNIQUE,
    slug TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL,
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);
CREATE TABLE draft_tags (
    content_id INTEGER NOT NULL REFERENCES content_drafts(content_id),
    tag_id INTEGER NOT NULL REFERENCES tags(id),
    PRIMARY KEY (content_id, tag_id)
);
CREATE TABLE revision_tags (
    revision_id INTEGER NOT NULL REFERENCES content_revisions(id),
    tag_id INTEGER NOT NULL REFERENCES tags(id),
    PRIMARY KEY (revision_id, tag_id)
);
CREATE TABLE draft_topic_entries (
    topic_content_id INTEGER NOT NULL REFERENCES content_drafts(content_id),
    position INTEGER NOT NULL CHECK (position >= 1),
    target_content_id INTEGER NOT NULL REFERENCES content_items(id),
    PRIMARY KEY (topic_content_id, position),
    UNIQUE (topic_content_id, target_content_id),
    CHECK (topic_content_id != target_content_id)
);
CREATE TABLE revision_topic_entries (
    topic_revision_id INTEGER NOT NULL REFERENCES content_revisions(id),
    position INTEGER NOT NULL CHECK (position >= 1),
    target_content_id INTEGER NOT NULL REFERENCES content_items(id),
    PRIMARY KEY (topic_revision_id, position),
    UNIQUE (topic_revision_id, target_content_id)
);
CREATE TABLE content_routes (
    id INTEGER PRIMARY KEY,
    content_id INTEGER NOT NULL REFERENCES content_items(id),
    path TEXT NOT NULL UNIQUE,
    kind TEXT NOT NULL CHECK (kind IN ('canonical','redirect')),
    created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX content_canonical ON content_routes(content_id) WHERE kind = 'canonical';
CREATE INDEX routes_content ON content_routes(content_id, id);
CREATE TABLE audit_events (
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
CREATE INDEX audit_actor ON audit_events(actor_user_id, id);

-- +goose StatementBegin
CREATE TRIGGER content_type_immutable BEFORE UPDATE OF type, owner_user_id ON content_items
BEGIN SELECT RAISE(ABORT, 'content identity is immutable'); END;
-- +goose StatementEnd
-- +goose StatementBegin
CREATE TRIGGER content_revisions_update_forbidden BEFORE UPDATE ON content_revisions
BEGIN SELECT RAISE(ABORT, 'immutable history'); END;
-- +goose StatementEnd
-- +goose StatementBegin
CREATE TRIGGER content_revisions_delete_forbidden BEFORE DELETE ON content_revisions
BEGIN SELECT RAISE(ABORT, 'immutable history'); END;
-- +goose StatementEnd
-- +goose StatementBegin
CREATE TRIGGER content_reviews_update_forbidden BEFORE UPDATE ON content_reviews
BEGIN SELECT RAISE(ABORT, 'immutable history'); END;
-- +goose StatementEnd
-- +goose StatementBegin
CREATE TRIGGER content_reviews_delete_forbidden BEFORE DELETE ON content_reviews
BEGIN SELECT RAISE(ABORT, 'immutable history'); END;
-- +goose StatementEnd
-- +goose StatementBegin
CREATE TRIGGER revision_tags_update_forbidden BEFORE UPDATE ON revision_tags
BEGIN SELECT RAISE(ABORT, 'immutable history'); END;
-- +goose StatementEnd
-- +goose StatementBegin
CREATE TRIGGER revision_tags_delete_forbidden BEFORE DELETE ON revision_tags
BEGIN SELECT RAISE(ABORT, 'immutable history'); END;
-- +goose StatementEnd
-- +goose StatementBegin
CREATE TRIGGER revision_topic_entries_update_forbidden BEFORE UPDATE ON revision_topic_entries
BEGIN SELECT RAISE(ABORT, 'immutable history'); END;
-- +goose StatementEnd
-- +goose StatementBegin
CREATE TRIGGER revision_topic_entries_delete_forbidden BEFORE DELETE ON revision_topic_entries
BEGIN SELECT RAISE(ABORT, 'immutable history'); END;
-- +goose StatementEnd
-- +goose StatementBegin
CREATE TRIGGER audit_events_update_forbidden BEFORE UPDATE ON audit_events
BEGIN SELECT RAISE(ABORT, 'immutable history'); END;
-- +goose StatementEnd
-- +goose StatementBegin
CREATE TRIGGER audit_events_delete_forbidden BEFORE DELETE ON audit_events
BEGIN SELECT RAISE(ABORT, 'immutable history'); END;
-- +goose StatementEnd
-- +goose StatementBegin
CREATE TRIGGER route_ownership_immutable BEFORE UPDATE OF content_id, path ON content_routes
BEGIN SELECT RAISE(ABORT, 'permanent route ownership'); END;
-- +goose StatementEnd
-- +goose StatementBegin
CREATE TRIGGER route_delete_forbidden BEFORE DELETE ON content_routes
BEGIN SELECT RAISE(ABORT, 'permanent route ownership'); END;
-- +goose StatementEnd

-- +goose Down
DROP TABLE audit_events;
DROP TABLE content_routes;
DROP TABLE revision_topic_entries;
DROP TABLE draft_topic_entries;
DROP TABLE revision_tags;
DROP TABLE draft_tags;
DROP TABLE tags;
DROP TABLE content_reviews;
DROP TABLE content_revisions;
DROP TABLE content_drafts;
DROP TABLE content_items;
