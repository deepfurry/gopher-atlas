import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  developmentEnv,
  webDevelopmentEnv,
  publicToolEnv,
  repositoryRoot,
} from './dev-env.mjs';
import { packageCLI, supervise } from './dev-processes.mjs';
import { prepare } from './prepare-web-content.mjs';

export function preparationMessage(error) {
  if (error.message === 'no published snapshot available')
    return 'Public Web: no published snapshot available (latest.json is missing). Publish a snapshot to the development content bucket, or set CONTENT_SNAPSHOT_FILE=tests/fixtures/content-snapshot-v1.json in root .env.';
  if (error.message === 'content_input_not_configured')
    return 'Public Web: configure CONTENT_R2_* (Development may fall back to R2_*), or set CONTENT_SNAPSHOT_FILE in root .env.';
  return 'Public Web: content preparation failed; check development input/configuration and snapshot integrity.';
}

export async function prepareDevelopmentWeb() {
  const env = webDevelopmentEnv(developmentEnv());
  await prepare(env, undefined, {
    development: (env.APP_ENV || 'development') === 'development',
  });
  const cwd = resolve(repositoryRoot, 'apps/web');
  console.log(
    'Public snapshot prepared. Restart dev-web to load a newer published generation.',
  );
  return {
    name: 'Public Web',
    command: process.execPath,
    args: [packageCLI(cwd, 'astro'), 'dev', '--host', '127.0.0.1'],
    cwd,
    env: publicToolEnv(),
  };
}

export async function devWeb() {
  try {
    return await supervise([await prepareDevelopmentWeb()]);
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
