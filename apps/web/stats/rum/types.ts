import type { rumBotFilter } from '../../src/lib/stats/readership-contract';

/** Internal server data only. Never serialize configuration into Public output. */
export interface RumConfig {
  accountId: string;
  /** GraphQL RUM Site Tag, NOT the browser beacon's Site Token. */
  rumSiteTag: string;
  token: string;
  requestHost: 'gopheratlas.com';
  groupLimit: number;
}

export interface RumSettings {
  maxDuration: number;
  maxPageSize: number;
  notOlderThan: number;
  maxNumberOfFields: number;
}

export type RumWarning =
  | 'sampled_estimate'
  | 'sampling_unknown'
  | 'sampled_group_coverage_unverified'
  | 'group_limit_reached'
  | 'page_loads_mismatch'
  | 'visits_mismatch';

export interface RumQuality {
  status: 'complete' | 'partial' | 'unavailable';
  timezone: 'UTC';
  /** Requested query scope, including on failures; not a guarantee of human traffic. */
  botFilter: typeof rumBotFilter;
  sampled: boolean | 'unknown';
  /** Range of reported group averages, NOT a combined/weighted sampling rate. */
  sampleIntervalRange: [number, number] | null;
  warnings: RumWarning[];
}

export interface RumCounts {
  pageLoads: number;
  visits: number;
  sampleInterval: number | null;
}

export interface RumPage extends RumCounts {
  path: string;
}

export interface RumReferral extends RumCounts {
  source: string;
  category: 'internal' | 'direct-unknown' | 'search' | 'external';
}

export interface RumGroups<T> {
  rows: T[];
  quality: RumQuality;
  coverage: {
    returnedGroups: number;
    limit: number;
    pageLoads: number;
    visits: number;
    pageLoadsDelta: number;
    visitsDelta: number;
  };
}

export type RumErrorCode =
  | 'server_only'
  | 'invalid_config'
  | 'invalid_date'
  | 'incomplete_day'
  | 'dataset_disabled'
  | 'fields_unavailable'
  | 'query_limit'
  | 'outside_retention'
  | 'unauthorized'
  | 'forbidden'
  | 'rate_limited'
  | 'http_error'
  | 'network_error'
  | 'timeout'
  | 'aborted'
  | 'response_too_large'
  | 'invalid_json'
  | 'graphql_error'
  | 'account_unavailable'
  | 'invalid_response';

export type RumStage = 'input' | 'settings' | 'site' | 'pages' | 'referrers';

interface RumContext {
  source: 'cloudflare-rum';
  requestHost: 'gopheratlas.com';
  /** Null if the requested date itself could not be validated. */
  dateUtc: string | null;
  window: { startInclusive: string; endExclusive: string } | null;
  settings: RumSettings | null;
  quality: RumQuality;
}

export type RumDay = RumContext &
  (
    | {
        ok: true;
        readAt: string;
        site: RumCounts & { quality: RumQuality };
        pages: RumGroups<RumPage>;
        referrers: RumGroups<RumReferral>;
      }
    | {
        ok: false;
        error: { code: RumErrorCode; stage: RumStage };
        site: null;
        pages: null;
        referrers: null;
      }
  );
