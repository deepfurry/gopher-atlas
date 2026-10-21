-- +goose Up
ALTER TABLE content_drafts ADD COLUMN english_enabled INTEGER NOT NULL DEFAULT 0 CHECK (english_enabled IN (0,1));
ALTER TABLE content_drafts ADD COLUMN title_en TEXT NOT NULL DEFAULT '';
ALTER TABLE content_drafts ADD COLUMN summary_en TEXT NOT NULL DEFAULT '';
ALTER TABLE content_drafts ADD COLUMN body_markdown_en TEXT NOT NULL DEFAULT '';
ALTER TABLE content_drafts ADD COLUMN seo_title_en TEXT NOT NULL DEFAULT '';
ALTER TABLE content_drafts ADD COLUMN seo_description_en TEXT NOT NULL DEFAULT '';
ALTER TABLE content_drafts ADD COLUMN english_labels_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(english_labels_json));
ALTER TABLE content_revisions ADD COLUMN english_enabled INTEGER NOT NULL DEFAULT 0 CHECK (english_enabled IN (0,1));
ALTER TABLE content_revisions ADD COLUMN title_en TEXT NOT NULL DEFAULT '';
ALTER TABLE content_revisions ADD COLUMN summary_en TEXT NOT NULL DEFAULT '';
ALTER TABLE content_revisions ADD COLUMN body_markdown_en TEXT NOT NULL DEFAULT '';
ALTER TABLE content_revisions ADD COLUMN seo_title_en TEXT NOT NULL DEFAULT '';
ALTER TABLE content_revisions ADD COLUMN seo_description_en TEXT NOT NULL DEFAULT '';
ALTER TABLE content_revisions ADD COLUMN english_labels_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(english_labels_json));

CREATE TABLE editorial_localization_state (
 id INTEGER PRIMARY KEY CHECK (id=1),
 ready INTEGER NOT NULL CHECK (ready IN (0,1)),
 activated INTEGER NOT NULL DEFAULT 0 CHECK (activated IN (0,1))
);
INSERT INTO editorial_localization_state VALUES (1, CASE WHEN EXISTS(SELECT 1 FROM content_items) THEN 0 ELSE 1 END, 0);

-- +goose Down
CREATE TABLE editorial_down_guard (value INTEGER CHECK (value = 0));
INSERT INTO editorial_down_guard SELECT 1 FROM content_drafts WHERE english_enabled != 0 OR title_en != '' OR summary_en != '' OR body_markdown_en != '' OR seo_title_en != '' OR seo_description_en != '' OR english_labels_json != '{}' LIMIT 1;
INSERT INTO editorial_down_guard SELECT 1 FROM content_revisions WHERE english_enabled != 0 OR title_en != '' OR summary_en != '' OR body_markdown_en != '' OR seo_title_en != '' OR seo_description_en != '' OR english_labels_json != '{}' LIMIT 1;
INSERT INTO editorial_down_guard SELECT 1 FROM editorial_localization_state WHERE activated=1;
DROP TABLE editorial_down_guard;
DROP TABLE editorial_localization_state;
ALTER TABLE content_revisions DROP COLUMN english_labels_json;
ALTER TABLE content_revisions DROP COLUMN seo_description_en;
ALTER TABLE content_revisions DROP COLUMN seo_title_en;
ALTER TABLE content_revisions DROP COLUMN body_markdown_en;
ALTER TABLE content_revisions DROP COLUMN summary_en;
ALTER TABLE content_revisions DROP COLUMN title_en;
ALTER TABLE content_revisions DROP COLUMN english_enabled;
ALTER TABLE content_drafts DROP COLUMN english_labels_json;
ALTER TABLE content_drafts DROP COLUMN seo_description_en;
ALTER TABLE content_drafts DROP COLUMN seo_title_en;
ALTER TABLE content_drafts DROP COLUMN body_markdown_en;
ALTER TABLE content_drafts DROP COLUMN summary_en;
ALTER TABLE content_drafts DROP COLUMN title_en;
ALTER TABLE content_drafts DROP COLUMN english_enabled;
