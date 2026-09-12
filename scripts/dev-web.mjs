import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  developmentEnv,
  webDevelopmentEnv,
  publicToolEnv,
  repositoryRoot,
} from './dev-env.mjs';
import { packageCLI, supervise } from './dev-processes.mjs';
import { readPrepared, writePrepared } from './prepare-web-content.mjs';
import { sha256, validateSnapshot } from './snapshot.mjs';
import {
  createSnapshotWatcher,
  validateDevelopmentPublication,
} from './dev-snapshot-watcher.mjs';

export function preparationMessage(error) {
  if (error.message === 'no published snapshot available')
    return 'Public Web: no published snapshot available (latest.json is missing). Waiting for a snapshot in the configured content bucket; explicit CONTENT_SNAPSHOT_FILE disables watching.';
  if (error.message === 'content_input_not_configured')
    return 'Public Web: configure CONTENT_R2_* (Development may fall back to R2_*), or set CONTENT_SNAPSHOT_FILE in root .env.';
  return 'Public Web: content preparation failed; check development input/configuration and snapshot integrity.';
}

export async function prepareDevelopmentWeb(input = developmentEnv()) {
  if ((input.APP_ENV || 'development') !== 'development')
    throw new Error('Development entry requires APP_ENV=development');
  const env = webDevelopmentEnv(input);
  let result;
  try {
    result = validateDevelopmentPublication(
      await readPrepared(env, { development: true, timeoutMs: 5000 }),
    );
  } catch (error) {
    if (
      env.CONTENT_SNAPSHOT_FILE ||
      error.message !== 'no published snapshot available'
    )
      throw error;
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
    result = { data, hash: sha256(data), snapshot: validateSnapshot(data) };
    console.log(
      'Public Web: no published snapshot available; showing an empty site while watching for the first publication.',
    );
  }
  writePrepared(result);
  const cwd = resolve(repositoryRoot, 'apps/web');
  console.log(
    env.CONTENT_SNAPSHOT_FILE
      ? 'Public fixture prepared; R2 watching disabled.'
      : 'Public snapshot prepared; watching latest.json every 2 seconds.',
  );
  return {
    command: {
      name: 'Public Web',
      command: process.execPath,
      args: [
        packageCLI(cwd, 'astro'),
        'dev',
        '--host',
        '127.0.0.1',
        '--port',
        '4321',
      ],
      cwd,
      env: {
        ...publicToolEnv(),
        GOPHERATLAS_DEV_ADMIN_ORIGIN:
          input.CMS_BASE_URL || 'http://127.0.0.1:5173',
      },
    },
    onStart: ({ restart, signal }) =>
      createSnapshotWatcher(env, result.snapshot.generation, (next) =>
        restart('Public Web', () => writePrepared(next)),
      )?.run(signal),
  };
}

export async function devWeb() {
  try {
    const web = await prepareDevelopmentWeb();
    return await supervise([web.command], { onStart: web.onStart });
  } catch (error) {
    console.error(preparationMessage(error));
    return 1;
  }
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
)
  process.exitCode = await devWeb();
