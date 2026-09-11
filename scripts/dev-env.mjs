import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));

// Only development entry points call this. Match dev-cms: process env wins,
// including explicitly empty values, and an absent root .env is allowed.
export function developmentEnv(root = repositoryRoot, inherited = process.env) {
  let file = {};
  try {
    file = parseEnv(readFileSync(resolve(root, '.env'), 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw new Error('development_env_unreadable');
  }
  return { ...file, ...inherited };
}

export function webDevelopmentEnv(env, root = repositoryRoot) {
  const result = { ...env };
  if ((env.APP_ENV || 'development') === 'development') {
    for (const [target, source] of [
      ['CONTENT_R2_ENDPOINT', 'R2_ENDPOINT'],
      ['CONTENT_R2_BUCKET', 'R2_CONTENT_BUCKET'],
      ['CONTENT_R2_ACCESS_KEY_ID', 'R2_ACCESS_KEY_ID'],
      ['CONTENT_R2_SECRET_ACCESS_KEY', 'R2_SECRET_ACCESS_KEY'],
    ])
      result[target] ||= env[source];
  }
  // Development fixture paths are consistently relative to the repository root,
  // whether invoked via Make or pnpm --filter from a package directory.
  if (result.CONTENT_SNAPSHOT_FILE)
    result.CONTENT_SNAPSHOT_FILE = resolve(root, result.CONTENT_SNAPSHOT_FILE);
  return result;
}

// The private preparation step gets configuration; the browser tooling does not.
export function publicToolEnv(env = process.env) {
  return Object.fromEntries(
    Object.entries(env).filter(
      ([key]) =>
        !/^(CONTENT_|R2_|GITHUB_|CLOUDFLARE_|CMS_|DATABASE_|BOOTSTRAP_|SESSION_|OAUTH_|LOG_|PUBLIC_|VITE_)/.test(
          key,
        ),
    ),
  );
}
