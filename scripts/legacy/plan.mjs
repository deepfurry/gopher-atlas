import { readFileSync, readdirSync, existsSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import snapshotSchema from '../../contracts/content-snapshot.schema.json' with { type: 'json' };
import { join, relative } from 'node:path';
import { parse } from 'yaml';
import {
  parseMarkdown,
  validateMarkdown,
  isSafeLink,
  isControlledImage,
} from '../../packages/markdown/src/index.ts';
import { validateSnapshot } from '../snapshot.mjs';

export const legacySlug = (value) =>
  value
    .trim()
    .toLowerCase()
    .replaceAll('&', ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
const slugOK = (value) =>
  typeof value === 'string' &&
  value.length <= 100 &&
  /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
const topicOrder = [
  'go-new-features',
  'benchmarking-and-comparisons',
  'performance-optimization',
  'daily-library',
  'web-development',
];
// Legacy CATEGORY_SLUG_MAP differs from generic tag slugification for '&'.
export const legacyCategorySlug = (value) =>
  value === 'Benchmarking & Comparisons'
    ? 'benchmarking-and-comparisons'
    : legacySlug(value);
const walk = (node, fn) => {
  fn(node);
  for (const child of node.children ?? []) walk(child, fn);
};
const placeholder = 'https://assets.gopheratlas.com/legacy-plan-image.png';
const schemaValidator = new Ajv2020({ strict: true, allErrors: true });
addFormats(schemaValidator);
const inspectProjection = schemaValidator.compile(snapshotSchema);

/** Offsets refer to source Markdown, never code fence contents or ordinary links. */
export function imageReferences(markdown) {
  const tree = parseMarkdown(markdown),
    definitions = new Map(),
    images = [];
  walk(tree, (node) => {
    if (node.type === 'definition' && !definitions.has(node.identifier))
      definitions.set(node.identifier, node);
  });
  walk(tree, (node) => {
    if (!['image', 'imageReference'].includes(node.type)) return;
    const target =
      node.type === 'image' ? node : definitions.get(node.identifier);
    images.push({
      alt: node.alt ?? '',
      url: target?.url ?? '',
      start: target?.position?.start.offset,
      end: target?.position?.end.offset,
      line: node.position?.start.line,
    });
  });
  return images;
}
export function rewriteImages(markdown, replacements) {
  const references = imageReferences(markdown),
    changes = new Map();
  for (const image of references) {
    if (!replacements.has(image.url)) continue;
    if (image.start === undefined || image.end === undefined)
      throw new Error('image_reference_invalid');
    const source = markdown.slice(image.start, image.end);
    // Restrict replacement to the parsed image/definition destination. The real
    // legacy sources use literal URLs; ambiguous escaped destinations fail closed.
    const at = source.lastIndexOf(image.url);
    if (at < 0) throw new Error('image_destination_unsupported');
    changes.set(image.start + at, {
      end: image.start + at + image.url.length,
      value: replacements.get(image.url),
    });
  }
  for (const [start, change] of [...changes].sort(([a], [b]) => b - a))
    markdown =
      markdown.slice(0, start) + change.value + markdown.slice(change.end);
  return markdown;
}
function document(file) {
  const raw = readFileSync(file, 'utf8').replaceAll('\r\n', '\n');
  const match = /^---\n([\s\S]*?)\n---(?:\n|$)/.exec(raw);
  if (!match) throw new Error('frontmatter_missing');
  return {
    data: parse(match[1], { uniqueKeys: true, maxAliasCount: 0 }),
    body: raw.slice(match[0].length).trim(),
  };
}
function date(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new Error('invalid_date');
  const time = Date.parse(`${value}T00:00:00Z`);
  if (
    !Number.isFinite(time) ||
    new Date(time).toISOString().slice(0, 10) !== value
  )
    throw new Error('invalid_date');
  return time;
}

/** Pure source plan: no environment, DB, storage client or network is accessed. */
export function createLegacyPlan(source, { ownerId, authors = {} } = {}) {
  const result = {
    schemaVersion: 1,
    ownerId,
    tags: [],
    items: [],
    images: [],
    routes: [],
    warnings: [],
    errors: [],
    stats: {},
    siteFiles: [],
  };
  const error = (file, field, reason) =>
    result.errors.push({ file, field, reason });
  for (const file of [
    'src/content/pages/about.md',
    'src/content/pages/contribute.md',
    'src/static/images/logo.png',
  ]) {
    if (!existsSync(join(source, file))) {
      result.warnings.push({
        file,
        field: 'siteFile',
        reason: 'site_owned_source_missing',
      });
      continue;
    }
    const bytes = readFileSync(join(source, file));
    if (!bytes.length) error(file, 'siteFile', 'empty_source');
    if (file.endsWith('.md')) document(join(source, file));
    result.siteFiles.push({
      file,
      action: file.endsWith('.png')
        ? 'preserve_brand_asset'
        : 'adapt_site_owned_page_to_cms',
    });
  }
  if (!Number.isSafeInteger(ownerId) || ownerId < 1)
    error('options', 'ownerId', 'explicit_cms_author_required');
  const tags = new Map(),
    tagSlugs = new Map(),
    ids = new Map(),
    groups = new Map(),
    images = new Set(),
    routes = new Set();
  const add = (file, kind, fields, extra = {}) => {
    if (!slugOK(fields.slug)) error(file, 'slug', 'legacy_slug_incompatible');
    const path =
      kind === 'note'
        ? `/notes/${fields.payload.groupSlug}/${fields.slug}/`
        : `/${kind === 'curated_article' ? 'articles' : 'topics'}/${fields.slug}/`;
    if (routes.has(path)) error(file, 'route', 'route_collision');
    routes.add(path);
    const refs = imageReferences(fields.bodyMarkdown);
    for (const ref of refs) {
      if (!ref.alt.trim())
        error(file, `bodyMarkdown:${ref.line}`, 'missing_alt');
      if (!isSafeLink(ref.url) || !ref.url.startsWith('https://'))
        error(file, `bodyMarkdown:${ref.line}`, 'unsafe_image_url');
      if (!isControlledImage(ref.url)) images.add(ref.url);
    }
    let validationBody = fields.bodyMarkdown;
    try {
      validationBody = rewriteImages(
        fields.bodyMarkdown,
        new Map(refs.map((ref) => [ref.url, placeholder])),
      );
    } catch {
      error(file, 'bodyMarkdown', 'image_destination_unsupported');
    }
    for (const issue of validateMarkdown(validationBody))
      error(file, `bodyMarkdown:${issue.line ?? 0}`, issue.code);
    const edits = new Map();
    for (const ref of refs.filter((image) => !isControlledImage(image.url))) {
      const at = fields.bodyMarkdown
        .slice(ref.start, ref.end)
        .lastIndexOf(ref.url);
      if (at < 0) continue;
      const start = Buffer.byteLength(
        fields.bodyMarkdown.slice(0, ref.start + at),
      );
      edits.set(start, {
        url: ref.url,
        start,
        end: start + Buffer.byteLength(ref.url),
      });
    }
    const item = {
      key: `${kind}:${fields.slug}`,
      file,
      type: kind,
      ...fields,
      imageEdits: [...edits.values()].sort((a, b) => b.start - a.start),
      tagSlugs: [],
      targetKeys: [],
      ...extra,
    };
    result.items.push(item);
    result.routes.push({ file, path, preserved: kind !== 'curated_article' });
    return item;
  };
  const common = (
    title,
    slug,
    summary,
    body,
    bylineId,
    payload,
    language = 'zh',
  ) => ({
    title,
    slug,
    summary,
    bodyMarkdown: body,
    bylineUserId: bylineId,
    language,
    featured: false,
    seoTitle: '',
    seoDescription: '',
    coverAssetId: null,
    payload,
  });
  const articles = JSON.parse(
    readFileSync(join(source, 'src/data/articles.json'), 'utf8'),
  );
  if (!Array.isArray(articles) || articles.length > 10000)
    throw new Error('legacy_articles_invalid');
  for (const a of articles) {
    const file = `src/data/articles.json#${a.id}`;
    try {
      if (ids.has(a.id)) error(file, 'id', 'duplicate_article');
      const payload = {
        sourceUrl: a.url,
        originalUrl: a.originalUrl ?? '',
        sourceAuthor: a.author ?? '',
        sourceName: a.source ?? '',
        sourcePublishedAt: a.publishedAt ?? '',
        sourceLanguage: a.language,
        difficulty: a.difficulty,
        rating: a.rating,
        mustRead: a.mustRead ?? false,
        relatedLinks: a.links ?? [],
      };
      if (payload.sourcePublishedAt) date(payload.sourcePublishedAt);
      const tagList = [];
      for (const name of a.tags) {
        const slug = legacySlug(name);
        if (!slugOK(slug))
          error(file, 'tags', 'empty_or_incompatible_tag_slug');
        if (tagSlugs.has(slug) && tagSlugs.get(slug) !== name)
          error(file, 'tags', `tag_slug_collision:${slug}`);
        tagSlugs.set(slug, name);
        tags.set(name, { name, slug, description: '' });
        tagList.push(slug);
      }
      const at = date(a.addedAt);
      const item = add(
        file,
        'curated_article',
        common(
          a.title,
          a.id,
          a.summary,
          a.reason,
          ownerId,
          payload,
          a.language,
        ),
        {
          featured: a.featured ?? false,
          tagSlugs: [...new Set(tagList)],
          firstPublishedAt: at,
          lastPublishedAt: at,
        },
      );
      ids.set(a.id, item);
    } catch {
      error(file, 'article', 'invalid_legacy_article');
    }
  }
  const topicDir = join(source, 'src/content/topics');
  const topics = readdirSync(topicDir)
    .filter((f) => f.endsWith('.md'))
    .map((file) => ({
      file: `src/content/topics/${file}`,
      ...document(join(topicDir, file)),
    }));
  topics.sort((a, b) => {
    const left = topicOrder.indexOf(a.data.slug),
      right = topicOrder.indexOf(b.data.slug);
    if (left !== -1 || right !== -1)
      return (left === -1 ? 999 : left) - (right === -1 ? 999 : right);
    return a.data.title.localeCompare(b.data.title, 'en');
  });
  for (const [order, topic] of topics.entries()) {
    const { data, body, file } = topic;
    const recommended = [
      ...new Set((data.readingOrder ?? []).filter((id) => ids.has(id))),
    ];
    for (const missing of (data.readingOrder ?? []).filter(
      (id) => !ids.has(id),
    ))
      result.warnings.push({
        file,
        field: 'readingOrder',
        reason: `missing_legacy_article:${missing}`,
      });
    const matched = articles
      .filter((a) => legacyCategorySlug(a.category) === data.slug)
      .map((a) => a.id);
    const targetKeys = [...new Set([...recommended, ...matched])].map(
      (id) => ids.get(id)?.key,
    );
    add(
      file,
      'topic',
      common(data.title, data.slug, data.summary, body, ownerId, {
        order,
        recommendedCount: recommended.length,
      }),
      { targetKeys },
    );
  }
  const noteDir = join(source, 'src/content/notes');
  for (const groupDir of readdirSync(noteDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name))) {
    for (const file of readdirSync(join(noteDir, groupDir.name))
      .filter((f) => f.endsWith('.md'))
      .sort()) {
      const full = join(noteDir, groupDir.name, file),
        relativeFile = relative(source, full).replaceAll('\\', '/');
      try {
        const { data, body } = document(full);
        const byline = authors[data.author];
        if (!Number.isSafeInteger(byline) || byline < 1)
          error(
            relativeFile,
            'author',
            `author_mapping_required:${data.author}`,
          );
        const slug =
          typeof data.slug === 'string' && data.slug.trim()
            ? legacySlug(data.slug)
            : file.slice(0, -3);
        const payload = {
          group:
            data.group ||
            groupDir.name
              .split('-')
              .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
              .join(' '),
          groupSlug: groupDir.name,
          groupDescription: data.groupDescription ?? '',
          groupOrder: Number(data.groupOrder ?? 999),
          order: Number(data.order ?? 999),
        };
        const metadata = JSON.stringify([
          payload.group,
          payload.groupDescription,
          payload.groupOrder,
        ]);
        if (
          groups.has(payload.groupSlug) &&
          groups.get(payload.groupSlug).metadata !== metadata
        )
          error(
            relativeFile,
            'group',
            `group_metadata_conflict:${groups.get(payload.groupSlug).file}`,
          );
        groups.set(payload.groupSlug, { metadata, file: relativeFile });
        add(
          relativeFile,
          'note',
          common(data.title, slug, data.description, body, byline, payload),
          {
            firstPublishedAt: date(data.createdAt),
            lastPublishedAt: date(data.updatedAt),
          },
        );
      } catch {
        error(relativeFile, 'note', 'invalid_legacy_note');
      }
    }
  }
  result.tags = [...tags.values()].sort((a, b) => a.slug.localeCompare(b.slug));
  for (const tag of result.tags)
    result.routes.push({
      file: 'src/data/articles.json',
      path: `/tags/${tag.slug}/`,
      preserved: true,
    });
  result.images = [...images].sort();
  // Validate each complete candidate with the real closed snapshot fields/payload
  // contract. Temporary image destinations are validation-only, never apply data.
  const all = result.items.map((item, i) => ({ ...item, id: i + 1 }));
  const keyIDs = new Map(all.map((item) => [item.key, item.id]));
  const tagIDs = new Map(result.tags.map((tag, i) => [tag.slug, i + 1]));
  const snapshot = {
    schemaVersion: 1,
    generation: 0,
    exportedAt: new Date(0).toISOString(),
    authors: [...new Set(all.map((item) => item.bylineUserId))]
      .filter((id) => Number.isSafeInteger(id) && id > 0)
      .map((id) => ({
        id,
        slug: `author-${id}`,
        displayName: 'Import author',
        bioMarkdown: '',
        avatarUrl: '',
        websiteUrl: '',
      })),
    assets: [],
    tags: result.tags.map((tag, i) => ({ ...tag, id: i + 1 })),
    content: all.map((item) => ({
      id: item.id,
      type: item.type,
      revisionNo: 1,
      canonicalPath: result.routes.find((route) => route.file === item.file)
        ?.path,
      title: item.title,
      slug: item.slug,
      summary: item.summary,
      bodyMarkdown: rewriteImages(
        item.bodyMarkdown,
        new Map(result.images.map((url) => [url, placeholder])),
      ),
      authorId: item.bylineUserId,
      language: item.language,
      featured: item.featured,
      seoTitle: item.seoTitle,
      seoDescription: item.seoDescription,
      coverAssetId: null,
      firstPublishedAt: item.firstPublishedAt ?? 0,
      lastPublishedAt: item.lastPublishedAt ?? 0,
      tagIds: item.tagSlugs.map((slug) => tagIDs.get(slug)),
      topicEntries: item.targetKeys.map((key, i) => ({
        position: i + 1,
        targetContentId: keyIDs.get(key),
      })),
      payload: item.payload,
    })),
    routes: all.map((item) => ({
      path: result.routes.find((route) => route.file === item.file)?.path,
      kind: 'canonical',
      contentId: item.id,
    })),
  };
  if (!inspectProjection(snapshot)) {
    // Report locations and classifications only, never Markdown or payload values.
    for (const issue of inspectProjection.errors ?? []) {
      const match = /^\/content\/(\d+)(.*)$/.exec(issue.instancePath);
      if (match)
        error(
          all[Number(match[1])].file,
          match[2] || 'content',
          `schema_${issue.keyword}`,
        );
      else
        error(
          'source',
          issue.instancePath || 'snapshot',
          `schema_${issue.keyword}`,
        );
    }
  }
  try {
    validateSnapshot(Buffer.from(JSON.stringify(snapshot)));
  } catch {
    error('source', 'snapshot', 'legacy_projection_invalid');
  }
  result.stats = {
    curatedArticles: all.filter((i) => i.type === 'curated_article').length,
    topics: topics.length,
    notes: all.filter((i) => i.type === 'note').length,
    tags: tags.size,
    images: images.size,
    topicEntries: all.reduce((n, i) => n + i.targetKeys.length, 0),
    recommendedEntries: all
      .filter((i) => i.type === 'topic')
      .reduce((n, i) => n + i.payload.recommendedCount, 0),
    preservedRoutes: result.routes.filter((r) => r.preserved).length,
    markdownDocuments: all.length,
  };
  return result;
}
