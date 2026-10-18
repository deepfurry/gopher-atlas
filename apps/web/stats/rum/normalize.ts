import { rumBotFilter } from '../../src/lib/stats/readership-contract';
import type {
  RumCounts,
  RumErrorCode,
  RumGroups,
  RumPage,
  RumQuality,
  RumReferral,
  RumSettings,
} from './types';

// Only these safe classifications can leave the adapter; never attach a cause,
// provider message, response body, request variables or configuration.
export class RumError extends Error {
  constructor(readonly code: RumErrorCode) {
    super(`rum_${code}`);
    this.name = 'RumError';
  }
}

export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new RumError('invalid_response');
  }
  return value as Record<string, unknown>;
}

function metric(value: unknown): number {
  // Preserve upstream estimates without rounding or multiplying them.
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > Number.MAX_SAFE_INTEGER
  ) {
    throw new RumError('invalid_response');
  }
  return value;
}

export function account(body: unknown): Record<string, unknown> {
  const envelope = record(body);
  if ('errors' in envelope && envelope.errors !== null) {
    throw new RumError('graphql_error');
  }
  const accounts = record(record(envelope.data).viewer).accounts;
  if (!Array.isArray(accounts) || accounts.length !== 1) {
    throw new RumError('account_unavailable');
  }
  return record(accounts[0]);
}

export function settingsFrom(body: unknown): RumSettings {
  const node = record(
    record(account(body).settings).rumPageloadEventsAdaptiveGroups,
  );
  if (node.enabled === false) throw new RumError('dataset_disabled');
  if (node.enabled !== true) throw new RumError('invalid_response');
  const settings: RumSettings = {
    maxDuration: metric(node.maxDuration),
    maxPageSize: metric(node.maxPageSize),
    notOlderThan: metric(node.notOlderThan),
    maxNumberOfFields: metric(node.maxNumberOfFields),
  };
  if (Object.values(settings).some((n) => !Number.isSafeInteger(n) || n <= 0)) {
    throw new RumError('invalid_response');
  }
  const availableFields = node.availableFields;
  if (
    !Array.isArray(availableFields) ||
    availableFields.some((field) => typeof field !== 'string')
  ) {
    throw new RumError('invalid_response');
  }
  const required = [
    'dimensions_date',
    'dimensions_requestHost',
    'dimensions_requestPath',
    'dimensions_refererHost',
    'count',
    'sum_visits',
    'avg_sampleInterval',
  ];
  if (required.some((field) => !availableFields.includes(field))) {
    throw new RumError('fields_unavailable');
  }
  return settings;
}

export function utcWindow(dateUtc: string, now: number) {
  if (typeof dateUtc !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateUtc)) {
    throw new RumError('invalid_date');
  }
  const start = Date.parse(`${dateUtc}T00:00:00Z`),
    end = start + 86400000;
  if (
    !Number.isFinite(start) ||
    start < 0 ||
    !Number.isFinite(now) ||
    new Date(start).toISOString().slice(0, 10) !== dateUtc ||
    new Date(end).toISOString().length !== 24
  ) {
    throw new RumError('invalid_date');
  }
  if (end > now) throw new RumError('incomplete_day');
  return {
    startInclusive: new Date(start).toISOString().replace('.000Z', 'Z'),
    endExclusive: new Date(end).toISOString().replace('.000Z', 'Z'),
  };
}

export function checkLimits(
  settings: RumSettings,
  start: string,
  limit: number,
  now: number,
) {
  if (
    settings.maxDuration < 86400 ||
    limit > settings.maxPageSize ||
    settings.maxNumberOfFields < 6
  ) {
    throw new RumError('query_limit');
  }
  if (Date.parse(start) < now - settings.notOlderThan * 1000) {
    throw new RumError('outside_retention');
  }
}

function pathFrom(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length > 2048 ||
    !value.startsWith('/')
  ) {
    throw new RumError('invalid_response');
  }
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    throw new RumError('invalid_response');
  }
  // Reject rather than silently strip query/fragment/credentials or repair paths.
  // Keep case, encoding, trailing slash and language paths exactly as supplied.
  if (
    decoded.startsWith('//') ||
    /[\s\\?#]/u.test(decoded) ||
    [...decoded].some(
      (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127,
    ) ||
    decoded.split('/').some((segment) => segment === '.' || segment === '..')
  )
    throw new RumError('invalid_response');
  return value;
}

function referralFrom(
  value: unknown,
): Pick<RumReferral, 'source' | 'category'> {
  if (value === '')
    return { source: 'direct-unknown', category: 'direct-unknown' };
  if (typeof value !== 'string') throw new RumError('invalid_response');
  const source = value.toLowerCase().replace(/\.$/, '');
  if (
    source.length > 253 ||
    !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(
      source,
    )
  )
    throw new RumError('invalid_response');
  const category = ['gopheratlas.com', 'www.gopheratlas.com'].includes(source)
    ? 'internal'
    : ['bing.com', 'www.bing.com'].includes(source)
      ? 'search'
      : 'external';
  return { source, category };
}

export function quality(rows: RumCounts[]): RumQuality {
  const intervals = rows.flatMap((row) =>
    row.sampleInterval === null ? [] : [row.sampleInterval],
  );
  const sampled = intervals.some((n) => n > 1)
    ? true
    : rows.length === 0 || intervals.length !== rows.length
      ? 'unknown'
      : false;
  const unknownSampling = rows.length === 0 || intervals.length !== rows.length;
  return {
    status: 'complete',
    timezone: 'UTC',
    botFilter: rumBotFilter,
    sampled,
    sampleIntervalRange: intervals.length
      ? [
          intervals.reduce((min, n) => Math.min(min, n), Infinity),
          intervals.reduce((max, n) => Math.max(max, n), -Infinity),
        ]
      : null,
    warnings: [
      ...(sampled === true ? ['sampled_estimate' as const] : []),
      ...(unknownSampling ? ['sampling_unknown' as const] : []),
    ],
  };
}

export function rowsFrom(
  body: unknown,
  dateUtc: string,
  limit: number,
  kind: 'site',
): RumCounts[];
export function rowsFrom(
  body: unknown,
  dateUtc: string,
  limit: number,
  kind: 'pages',
): RumPage[];
export function rowsFrom(
  body: unknown,
  dateUtc: string,
  limit: number,
  kind: 'referrers',
): RumReferral[];
export function rowsFrom(
  body: unknown,
  dateUtc: string,
  limit: number,
  kind: 'site' | 'pages' | 'referrers',
) {
  const groups = account(body).rumPageloadEventsAdaptiveGroups;
  if (
    !Array.isArray(groups) ||
    groups.length > limit ||
    (kind === 'site' && groups.length > 1)
  ) {
    throw new RumError('invalid_response');
  }
  const keys = new Set<string>();
  return groups.map((value) => {
    const row = record(value),
      dim = record(row.dimensions),
      avg = record(row.avg);
    if (dim.date !== dateUtc || dim.requestHost !== 'gopheratlas.com') {
      throw new RumError('invalid_response');
    }
    const sampleInterval =
      avg.sampleInterval === null ? null : metric(avg.sampleInterval);
    if (sampleInterval !== null && sampleInterval < 1)
      throw new RumError('invalid_response');
    const counts: RumCounts = {
      pageLoads: metric(row.count),
      visits: metric(record(row.sum).visits),
      sampleInterval,
    };
    const result =
      kind === 'pages'
        ? { ...counts, path: pathFrom(dim.requestPath) }
        : kind === 'referrers'
          ? { ...counts, ...referralFrom(dim.refererHost) }
          : counts;
    const key =
      'path' in result
        ? result.path
        : 'source' in result
          ? result.source
          : 'site';
    if (typeof key !== 'string' || keys.has(key))
      throw new RumError('invalid_response');
    keys.add(key);
    return result;
  });
}

export function grouped<T extends RumCounts>(
  rows: T[],
  site: RumCounts,
  limit: number,
): RumGroups<T> {
  const q = quality(rows);
  const pageLoads = metric(rows.reduce((sum, row) => sum + row.pageLoads, 0));
  const visits = metric(rows.reduce((sum, row) => sum + row.visits, 0));
  // No invented sampling tolerance. Any discrepancy requires review; these
  // diagnostics NEVER replace the independent site totals or rescale rows.
  if (rows.length === limit) q.warnings.push('group_limit_reached');
  if (pageLoads !== site.pageLoads) q.warnings.push('page_loads_mismatch');
  if (visits !== site.visits) q.warnings.push('visits_mismatch');
  if (
    rows.length &&
    (q.sampled !== false ||
      site.sampleInterval === null ||
      site.sampleInterval > 1)
  ) {
    q.warnings.push('sampled_group_coverage_unverified');
  }
  if (
    q.warnings.some((w) =>
      [
        'group_limit_reached',
        'page_loads_mismatch',
        'visits_mismatch',
        'sampled_group_coverage_unverified',
      ].includes(w),
    )
  ) {
    q.status = 'partial';
  }
  return {
    rows,
    quality: q,
    coverage: {
      returnedGroups: rows.length,
      limit,
      pageLoads,
      visits,
      pageLoadsDelta: pageLoads - site.pageLoads,
      visitsDelta: visits - site.visits,
    },
  };
}
