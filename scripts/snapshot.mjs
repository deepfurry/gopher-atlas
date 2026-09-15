import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import snapshotSchema from '../contracts/content-snapshot.schema.json' with { type: 'json' };
import {
  isSafeLink,
  validateMarkdown,
  isAssetURL,
} from '../packages/markdown/src/index.ts';

export const maxSnapshotBytes = 128 * 1024 * 1024;
export const sha256 = (data) => createHash('sha256').update(data).digest('hex');
const ajv = new Ajv2020({ strict: true });
addFormats(ajv);
const validate = ajv.compile(snapshotSchema);
const invalid = () => {
  throw new Error('snapshot_invalid');
};
const unique = (rows, key = 'id') => {
  const values = new Map(rows.map((row) => [row[key], row]));
  if (values.size !== rows.length) invalid();
  return values;
};
export function validateSnapshot(data, { assetPolicy } = {}) {
  if (!Buffer.isBuffer(data) || data.length > maxSnapshotBytes) invalid();
  let snapshot;
  try {
    snapshot = JSON.parse(data.toString('utf8'));
  } catch {
    invalid();
  }
  if (!validate(snapshot)) invalid();
  const authors = unique(snapshot.authors),
    assets = unique(snapshot.assets),
    tags = unique(snapshot.tags),
    content = unique(snapshot.content);
  unique(snapshot.routes, 'path');
  const usedAuthors = new Set(),
    usedAssets = new Set(),
    usedTags = new Set(),
    canonicals = new Map();
  const groups = new Map();
  for (const route of snapshot.routes) {
    if (!content.has(route.contentId)) invalid();
    if (route.kind === 'canonical') {
      if (canonicals.has(route.contentId)) invalid();
      canonicals.set(route.contentId, route.path);
    }
  }
  for (const item of snapshot.content) {
    if (item.type === 'note') {
      const { group, groupSlug, groupDescription, groupOrder } = item.payload;
      const metadata = JSON.stringify([group, groupDescription, groupOrder]);
      if (groups.has(groupSlug) && groups.get(groupSlug) !== metadata)
        invalid();
      groups.set(groupSlug, metadata);
    }
    if (
      item.type === 'topic' &&
      item.payload.recommendedCount > item.topicEntries.length
    )
      invalid();
    const prefix = {
      post: 'posts',
      curated_article: 'articles',
      topic: 'topics',
    }[item.type];
    const path =
      item.type === 'note'
        ? `/notes/${item.payload.groupSlug}/${item.slug}/`
        : `/${prefix}/${item.slug}/`;
    if (
      path !== item.canonicalPath ||
      canonicals.get(item.id) !== path ||
      !authors.has(item.authorId) ||
      item.firstPublishedAt > item.lastPublishedAt
    )
      invalid();
    usedAuthors.add(item.authorId);
    if (
      Buffer.byteLength(item.bodyMarkdown) > 524288 ||
      validateMarkdown(item.bodyMarkdown, assetPolicy).length
    )
      invalid();
    if (item.coverAssetId !== null) {
      if (!assets.has(item.coverAssetId)) invalid();
      usedAssets.add(item.coverAssetId);
    }
    for (const id of item.tagIds) {
      if (!tags.has(id)) invalid();
      usedTags.add(id);
    }
    unique(item.topicEntries, 'position');
    unique(item.topicEntries, 'targetContentId');
    for (const entry of item.topicEntries)
      if (
        entry.targetContentId === item.id ||
        content.get(entry.targetContentId)?.type !== 'curated_article'
      )
        invalid();
    if (item.type === 'curated_article') {
      for (const url of [
        item.payload.sourceUrl,
        item.payload.originalUrl,
        ...item.payload.relatedLinks.map((link) => link.url),
      ].filter(Boolean))
        if (!isSafeLink(url)) invalid();
    }
  }
  for (const author of snapshot.authors) {
    if (
      Buffer.byteLength(author.bioMarkdown) > 10000 ||
      validateMarkdown(author.bioMarkdown, assetPolicy).length ||
      [author.avatarUrl, author.websiteUrl].some(
        (url) => url && !isSafeLink(url),
      )
    )
      invalid();
  }
  for (const asset of snapshot.assets)
    if (
      asset.width * asset.height > 100000000 ||
      !isAssetURL(asset.url, assetPolicy)
    )
      invalid();
  if (
    usedAuthors.size !== authors.size ||
    usedAssets.size !== assets.size ||
    usedTags.size !== tags.size
  )
    invalid();
  return snapshot;
}

export function validateLatest(data) {
  if (data.length > 8192) invalid();
  let latest;
  try {
    latest = JSON.parse(data.toString('utf8'));
  } catch {
    invalid();
  }
  if (
    !latest ||
    Object.keys(latest).sort().join(',') !==
      'exportedAt,generation,schemaVersion,sha256,snapshotKey' ||
    latest.schemaVersion !== 1 ||
    !Number.isSafeInteger(latest.generation) ||
    latest.generation < 1 ||
    latest.snapshotKey !== `snapshots/generation-${latest.generation}.json` ||
    !/^[a-f0-9]{64}$/.test(latest.sha256) ||
    typeof latest.exportedAt !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T.+Z$/.test(latest.exportedAt) ||
    !Number.isFinite(Date.parse(latest.exportedAt))
  )
    invalid();
  return latest;
}

export function validateContentInput(env, { development = false } = {}) {
  const required = [
    'CONTENT_R2_ENDPOINT',
    'CONTENT_R2_BUCKET',
    'CONTENT_R2_ACCESS_KEY_ID',
    'CONTENT_R2_SECRET_ACCESS_KEY',
  ];
  if (required.some((key) => !env[key]))
    throw new Error('content_input_not_configured');
  let endpoint;
  try {
    endpoint = new URL(env.CONTENT_R2_ENDPOINT);
  } catch {
    throw new Error('content_input_invalid');
  }
  if (
    (endpoint.protocol !== 'https:' &&
      !(
        development &&
        endpoint.protocol === 'http:' &&
        ['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname)
      )) ||
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash ||
    endpoint.pathname !== '/' ||
    !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(env.CONTENT_R2_BUCKET)
  )
    throw new Error('content_input_invalid');
}

export async function loadSnapshot(
  env,
  { read = readFileSync, get, development = false } = {},
) {
  if (env.CONTENT_SNAPSHOT_FILE) {
    const data = read(env.CONTENT_SNAPSHOT_FILE);
    return { snapshot: validateSnapshot(data), data, hash: sha256(data) };
  }
  validateContentInput(env, { development });
  try {
    const latest = validateLatest(await get('latest.json', 8192));
    const data = await get(latest.snapshotKey, maxSnapshotBytes);
    const hash = sha256(data);
    if (hash !== latest.sha256) throw new Error('snapshot_hash_mismatch');
    const snapshot = validateSnapshot(data);
    if (
      snapshot.generation !== latest.generation ||
      snapshot.exportedAt !== latest.exportedAt
    )
      invalid();
    return { snapshot, data, hash };
  } catch {
    throw new Error('content_snapshot_load_failed');
  }
}
