import { open, realpath } from 'node:fs/promises';
import { dirname, resolve, relative, isAbsolute, sep } from 'node:path';
import { developmentAssetPolicy } from '../packages/markdown/src/index.ts';
import { repositoryRoot } from './dev-env.mjs';
import {
  maxSnapshotBytes,
  validateLatest,
  validateSnapshot,
  sha256,
} from './snapshot.mjs';

export function localDevelopment(env, root = repositoryRoot) {
  if ((env.APP_ENV || 'development') !== 'development')
    throw new Error('Development entry requires APP_ENV=development');
  if (env.CONTENT_SNAPSHOT_FILE)
    throw new Error(
      'CONTENT_SNAPSHOT_FILE is test-only; remove it for normal development.',
    );
  const address = env.CMS_LISTEN_ADDR || '127.0.0.1:46217';
  const assetBase = `http://${address}/__dev/assets`;
  const assetPolicy = developmentAssetPolicy(assetBase);
  const databasePath = resolve(
    root,
    env.DATABASE_PATH || './data/gopheratlas.db',
  );
  const storageRoot = resolve(dirname(databasePath), 'storage');
  return {
    databasePath,
    storageRoot,
    contentRoot: resolve(storageRoot, 'content'),
    assetBase,
    assetPolicy,
  };
}

async function readObject(config, key, limit) {
  if (
    key !== 'latest.json' &&
    !/^snapshots\/generation-[1-9][0-9]*\.json$/u.test(key)
  )
    throw new Error('local_snapshot_invalid');
  let file;
  try {
    const root = await realpath(config.contentRoot);
    const target = await realpath(resolve(root, key));
    const inside = relative(root, target);
    if (
      !inside ||
      isAbsolute(inside) ||
      inside === '..' ||
      inside.startsWith(`..${sep}`)
    )
      throw new Error('local_snapshot_invalid');
    file = await open(target, 'r');
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > limit)
      throw new Error('local_snapshot_invalid');
    const chunks = [];
    let size = 0;
    for await (const chunk of file.createReadStream({ autoClose: false })) {
      size += chunk.length;
      if (size > limit) throw new Error('local_snapshot_invalid');
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  } catch (error) {
    if (error.code === 'ENOENT') throw new Error('local_snapshot_missing');
    throw new Error('local_snapshot_unavailable');
  } finally {
    await file?.close();
  }
}
export async function readLocalLatest(config) {
  return validateLatest(await readObject(config, 'latest.json', 8192));
}
export async function readLocalPrepared(config) {
  const latest = await readLocalLatest(config);
  const data = await readObject(config, latest.snapshotKey, maxSnapshotBytes);
  const hash = sha256(data);
  if (hash !== latest.sha256) throw new Error('local_snapshot_invalid');
  const snapshot = validateSnapshot(data, { assetPolicy: config.assetPolicy });
  if (
    snapshot.generation !== latest.generation ||
    snapshot.exportedAt !== latest.exportedAt
  )
    throw new Error('local_snapshot_invalid');
  return { snapshot, data, hash };
}
export function emptyDevelopmentPublication() {
  const data = Buffer.from(
    JSON.stringify({
      schemaVersion: 1,
      generation: 0,
      exportedAt: new Date(0).toISOString(),
      authors: [],
      assets: [],
      tags: [],
      content: [],
      routes: [],
    }),
  );
  return { data, hash: sha256(data), snapshot: validateSnapshot(data) };
}
