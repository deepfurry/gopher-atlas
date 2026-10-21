import {
  pagesQuery,
  referrersQuery,
  settingsQuery,
  siteQuery,
} from './queries';
import {
  checkLimits,
  grouped,
  quality,
  rowsFrom,
  RumError,
  settingsFrom,
  utcWindow,
} from './normalize';
import type { RumConfig, RumDay, RumStage } from './types';

const endpoint = 'https://api.cloudflare.com/client/v4/graphql';
const timeoutMs = 10000;
const maxResponseBytes = 8 * 1024 * 1024;

interface Runtime {
  fetch?: typeof fetch;
  now?: () => number;
  signal?: AbortSignal;
}

async function request(
  query: string,
  variables: Record<string, unknown>,
  token: string,
  runtime: Runtime,
): Promise<unknown> {
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), timeoutMs);
  const signal = runtime.signal
    ? AbortSignal.any([runtime.signal, timeout.signal])
    : timeout.signal;
  try {
    signal.throwIfAborted();
    const response = await (runtime.fetch ?? globalThis.fetch)(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ query, variables }),
      // Workers runtime: avoid unsupported RequestInit credentials/redirect modes.
      // Do not follow redirects with an Authorization-bearing request.
      redirect: 'manual',
      cache: 'no-store',
      signal,
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new RumError(
        response.status === 401
          ? 'unauthorized'
          : response.status === 403
            ? 'forbidden'
            : response.status === 429
              ? 'rate_limited'
              : 'http_error',
      );
    }
    if (!response.body) throw new RumError('invalid_json');
    const reader = response.body.getReader(),
      chunks: Uint8Array[] = [];
    let length = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > maxResponseBytes) throw new RumError('response_too_large');
        chunks.push(value);
      }
    } finally {
      await reader.cancel();
      reader.releaseLock();
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    try {
      return JSON.parse(
        new TextDecoder('utf-8', { fatal: true }).decode(bytes),
      );
    } catch {
      throw new RumError('invalid_json');
    }
  } catch (error) {
    if (runtime.signal?.aborted) throw new RumError('aborted');
    if (timeout.signal.aborted) throw new RumError('timeout');
    throw error instanceof RumError ? error : new RumError('network_error');
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Explicit server call only. No env loading, import-time I/O, retries or storage.
 * Four bounded requests at most: fresh Settings, site, paths, referrers. Failure
 * discards the entire day's data so a caller cannot accidentally archive fake 0s.
 */
export async function readRumDay(
  config: RumConfig,
  dateUtc: string,
  runtime: Runtime = {},
): Promise<RumDay> {
  const context: Pick<
    RumDay,
    'source' | 'requestHost' | 'dateUtc' | 'window' | 'settings'
  > = {
    source: 'cloudflare-rum',
    requestHost: 'gopheratlas.com',
    dateUtc: null,
    window: null,
    settings: null,
  };
  let stage: RumStage = 'input';
  try {
    if (typeof window !== 'undefined' || typeof document !== 'undefined')
      throw new RumError('server_only');
    if (
      !config ||
      config.requestHost !== 'gopheratlas.com' ||
      typeof config.accountId !== 'string' ||
      !/^[a-f0-9]{32}$/i.test(config.accountId) ||
      typeof config.rumSiteTag !== 'string' ||
      !/^[a-f0-9]{32}$/i.test(config.rumSiteTag) ||
      typeof config.token !== 'string' ||
      !/^[\x21-\x7e]{1,4096}$/.test(config.token) ||
      !Number.isSafeInteger(config.groupLimit) ||
      config.groupLimit < 1
    )
      throw new RumError('invalid_config');
    // Keep all four requests in one scope even if the caller rotates its config.
    config = { ...config };
    const now = runtime.now ?? Date.now;
    context.window = utcWindow(dateUtc, now());
    context.dateUtc = dateUtc;
    stage = 'settings';
    const settings = settingsFrom(
      await request(
        settingsQuery,
        { accountTag: config.accountId },
        config.token,
        runtime,
      ),
    );
    context.settings = settings;
    checkLimits(
      settings,
      context.window.startInclusive,
      config.groupLimit,
      now(),
    );
    const variables = {
      accountTag: config.accountId,
      siteTag: config.rumSiteTag,
      start: context.window.startInclusive,
      end: context.window.endExclusive,
      limit: config.groupLimit,
    };
    stage = 'site';
    // A single fixed UTC day + exact host can produce at most one site group.
    const siteLimit = Math.min(2, settings.maxPageSize);
    const siteRows = rowsFrom(
      await request(
        siteQuery,
        { ...variables, limit: siteLimit },
        config.token,
        runtime,
      ),
      dateUtc,
      siteLimit,
      'site',
    );
    const site = {
      ...(siteRows[0] ?? { pageLoads: 0, visits: 0, sampleInterval: null }),
      quality: quality(siteRows),
    };
    stage = 'pages';
    const pageRows = rowsFrom(
      await request(pagesQuery, variables, config.token, runtime),
      dateUtc,
      config.groupLimit,
      'pages',
    );
    const pages = grouped(pageRows, site, config.groupLimit);
    pages.rows.sort(
      (a, b) => b.pageLoads - a.pageLoads || compare(a.path, b.path),
    );
    stage = 'referrers';
    const referralRows = rowsFrom(
      await request(referrersQuery, variables, config.token, runtime),
      dateUtc,
      config.groupLimit,
      'referrers',
    );
    // Internal rows remain separate and auditable, even when upstream assigns
    // visits to an alias. Do not recalculate site Visits after excluding them.
    const referrers = grouped(referralRows, site, config.groupLimit);
    referrers.rows.sort(
      (a, b) => b.visits - a.visits || compare(a.source, b.source),
    );
    const q = quality([...siteRows, ...pageRows, ...referralRows]);
    q.status =
      pages.quality.status === 'partial' ||
      referrers.quality.status === 'partial'
        ? 'partial'
        : 'complete';
    q.warnings = [
      ...new Set([
        ...q.warnings,
        ...pages.quality.warnings,
        ...referrers.quality.warnings,
      ]),
    ];
    return {
      ...context,
      ok: true,
      readAt: new Date(now()).toISOString(),
      quality: q,
      site,
      pages,
      referrers,
    };
  } catch (error) {
    return {
      ...context,
      ok: false,
      quality: { ...quality([]), status: 'unavailable' },
      error: {
        stage,
        code: error instanceof RumError ? error.code : 'invalid_response',
      },
      site: null,
      pages: null,
      referrers: null,
    };
  }
}

function compare(a: string, b: string) {
  return a < b ? -1 : a > b ? 1 : 0;
}
