import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { createLegacyPlan } from './legacy/plan.mjs';
import { developmentEnv, repositoryRoot } from './dev-env.mjs';

export function runLegacy(args = process.argv.slice(2)) {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      source: { type: 'string' },
      owner: { type: 'string' },
      author: { type: 'string', multiple: true },
      output: { type: 'string' },
      database: { type: 'string' },
    },
  });
  const mode = positionals[0];
  if (
    !['plan', 'apply'].includes(mode) ||
    positionals.length !== 1 ||
    !values.source
  )
    throw new Error(
      'Usage: node scripts/legacy-import.mjs plan|apply --source <checkout> --owner <CMS-author-ID> --author name=ID [--output .cache/legacy-plan.json] [--database <Development DB>]',
    );
  const authors = {};
  for (const value of values.author ?? []) {
    const at = value.lastIndexOf('=');
    if (at <= 0 || !/^\d+$/.test(value.slice(at + 1)))
      throw new Error('author mapping must be name=CMS-author-ID');
    authors[value.slice(0, at)] = Number(value.slice(at + 1));
  }
  const plan = createLegacyPlan(resolve(values.source), {
    ownerId: Number(values.owner),
    authors,
  });
  if (values.output) {
    const file = resolve(values.output);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(plan, null, 2) + '\n', { mode: 0o600 });
  }
  console.log(
    JSON.stringify(
      {
        stats: plan.stats,
        siteFiles: plan.siteFiles,
        routes: plan.routes,
        warnings: plan.warnings,
        errors: plan.errors,
      },
      null,
      2,
    ),
  );
  if (plan.errors.length) return 1;
  if (mode === 'plan') return 0;
  // Plan does not even load .env. Apply is the explicit mutation boundary.
  const env = developmentEnv();
  if (values.database) env.DATABASE_PATH = resolve(values.database);
  const result = spawnSync(
    'go',
    ['run', './cmd/gopheratlas-legacy-import', 'apply'],
    {
      cwd: repositoryRoot,
      env,
      input: JSON.stringify(plan),
      stdio: ['pipe', 'inherit', 'inherit'],
      windowsHide: true,
    },
  );
  if (result.error) throw new Error('legacy_apply_process_failed');
  return result.status ?? 1;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    process.exitCode = runLegacy();
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : 'legacy_import_failed',
    );
    process.exitCode = 1;
  }
}
