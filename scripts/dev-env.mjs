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

// The private preparation step gets configuration; the browser tooling does not.
export function publicToolEnv(env = process.env) {
  return Object.fromEntries(
    Object.entries(env).filter(
      ([key]) =>
        !/^(CONTENT_|R2_|GITHUB_|CLOUDFLARE_|CMS_|DATABASE_|BOOTSTRAP_|SESSION_|OAUTH_|LOG_|PUBLIC_|VITE_|GOPHERATLAS_DEV_)/.test(
          key,
        ),
    ),
  );
}
