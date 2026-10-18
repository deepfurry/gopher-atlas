export const ranges = ['7d', '30d', '90d'] as const;
export type StatsRange = (typeof ranges)[number];
export type CoverageState = 'complete' | 'partial' | 'unavailable';
export type SourceKey = 'direct-unknown' | 'search' | 'external-other';
export interface Coverage {
  available: boolean;
  status: CoverageState;
  days: number;
  startedAt: string | null;
  lastCompleteDay: string | null;
  lastSyncedAt: string | null;
}
export interface Readership {
  schemaVersion: 1;
  range: StatsRange;
  timezone: 'UTC';
  start: string;
  end: string;
  quality: {
    source: 'Cloudflare Web Analytics RUM';
    botFilter: 'unverified';
    visitsAreUniqueUsers: false;
    estimated: boolean;
  };
  coverage: { site: Coverage; pages: Coverage; referrers: Coverage };
  totals: { pageLoads: number; visits: number } | null;
  daily: {
    date: string;
    pageLoads: number | null;
    visits: number | null;
    quality: 'observed' | 'sampled-estimate' | 'partial' | null;
  }[];
  popularPages: {
    path: string;
    title: string;
    pageLoads: number;
    share: number;
  }[];
  referrers: { source: SourceKey; visits: number }[];
}
