import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { developmentEnv, publicToolEnv, repositoryRoot } from './dev-env.mjs';
import { packageCLI, supervise } from './dev-processes.mjs';
import { writePrepared } from './prepare-web-content.mjs';
import {
  localDevelopment,
  readLocalPrepared,
  emptyDevelopmentPublication,
} from './dev-storage.mjs';
import {
  createSnapshotWatcher,
  validateDevelopmentPublication,
} from './dev-snapshot-watcher.mjs';

export function preparationMessage(error) {
  if (
    error.message ===
    'CONTENT_SNAPSHOT_FILE is test-only; remove it for normal development.'
  )
    return error.message;
  return 'Public Web: content preparation failed; check development input/configuration and snapshot integrity.';
}

export async function prepareDevelopmentWeb(
  input = developmentEnv(),
  { output } = {},
) {
  if ((input.APP_ENV || 'development') !== 'development')
    throw new Error('Development entry requires APP_ENV=development');
  const env = localDevelopment(input);
  let result;
  try {
    result = validateDevelopmentPublication(await readLocalPrepared(env));
  } catch (error) {
    result = emptyDevelopmentPublication();
    console.log(
      error.message === 'local_snapshot_missing'
        ? 'Public Web: no local snapshot yet; showing an empty site and watching for publication.'
        : 'Public Web: local snapshot unavailable; showing an empty site and retrying.',
    );
  }
  writePrepared(result, output);
  const cwd = resolve(repositoryRoot, 'apps/web');
  console.log(
    'Public snapshot input: local filesystem; watching latest.json every 750 ms.',
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
        GOPHERATLAS_DEV_ASSET_BASE: env.assetBase,
      },
    },
    onStart: ({ restart, signal }) =>
      createSnapshotWatcher(env, result.snapshot.generation, (next) =>
        restart('Public Web', () => writePrepared(next, output)),
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
