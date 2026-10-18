export const manifestPath = '/.well-known/gopheratlas-stats.json';
export interface StatsManifest {
  schemaVersion: 1;
  generation: number;
  snapshotSha256: string;
  counts: {
    notes: number;
    curatedArticles: number;
    topics: number;
    tags: number;
  };
  routes: { path: string; canonicalPath: string; title: string }[];
}
export interface Assets {
  fetch(request: Request): Promise<Response>;
}
export const publicPath = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^\/(?:[a-z0-9]+(?:-[a-z0-9]+)*\/)*$/.test(value) &&
  value.length <= 1000 &&
  !/^\/(?:api|_private|admin)(?:\/|$)/.test(value);

export function validateManifest(value: unknown): StatsManifest {
  const m = value as StatsManifest;
  if (
    !m ||
    m.schemaVersion !== 1 ||
    !Number.isSafeInteger(m.generation) ||
    m.generation < 1 ||
    !/^[a-f0-9]{64}$/.test(m.snapshotSha256) ||
    !m.counts ||
    !['notes', 'curatedArticles', 'topics', 'tags'].every(
      (k) =>
        Number.isSafeInteger(m.counts[k as keyof typeof m.counts]) &&
        m.counts[k as keyof typeof m.counts] >= 0,
    ) ||
    !Array.isArray(m.routes) ||
    m.routes.length > 50000
  )
    throw Error('stats_manifest_invalid');
  const routes = new Map<string, string>();
  for (const row of m.routes) {
    if (
      !row ||
      !publicPath(row.path) ||
      !publicPath(row.canonicalPath) ||
      typeof row.title !== 'string' ||
      !row.title.trim() ||
      row.title.length > 500 ||
      routes.has(row.path)
    )
      throw Error('stats_manifest_invalid');
    routes.set(row.path, row.canonicalPath);
  }
  for (const target of routes.values())
    if (routes.get(target) !== target) throw Error('stats_manifest_invalid');
  return m;
}

export async function loadManifest(assets: Assets): Promise<StatsManifest> {
  const read = async (path: string) => {
    const response = await assets.fetch(
      new Request(`https://gopheratlas.com${path}`),
    );
    if (!response.ok) throw Error('stats_manifest_unavailable');
    const text = await response.text();
    if (text.length > 8 * 1024 * 1024) throw Error('stats_manifest_invalid');
    return JSON.parse(text);
  };
  const manifest = validateManifest(await read(manifestPath));
  const marker = await read('/.well-known/gopheratlas-build.json');
  if (
    marker.generation !== manifest.generation ||
    marker.snapshotSha256 !== manifest.snapshotSha256
  )
    throw Error('stats_manifest_mismatch');
  return manifest;
}
