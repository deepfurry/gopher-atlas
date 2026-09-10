import {
  mkdtempSync,
  mkdirSync,
  copyFileSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse, stringify } from 'yaml';
import { files, tool, removeTemp } from './lib.mjs';

const temp = mkdtempSync(join(tmpdir(), 'gopheratlas-sql-smoke-'));
try {
  const migrations = join(temp, 'migrations');
  mkdirSync(migrations);
  copyFileSync(
    'tests/fixtures/sqlc/00001_probe.sql',
    join(migrations, '00001_probe.sql'),
  );
  const config = parse(readFileSync('sqlc.yaml', 'utf8'));
  if (
    config.version !== '2' ||
    config.sql.length !== 1 ||
    config.sql[0].engine !== 'sqlite' ||
    config.sql[0].schema !== 'db/migrations' ||
    config.sql[0].queries !== 'db/queries' ||
    config.sql[0].gen.go.out !== 'internal/database/sqlc'
  )
    throw new Error('Unexpected sqlc configuration');
  copyFileSync('tests/fixtures/sqlc/probe.sql', join(temp, 'probe.sql'));
  config.sql[0].schema = 'migrations';
  config.sql[0].queries = 'probe.sql';
  config.sql[0].gen.go.out = 'generated';
  const configPath = join(temp, 'sqlc.yaml');
  writeFileSync(configPath, stringify(config));
  tool('sqlc', 'generate', '-f', configPath);
  if (
    !files(join(temp, 'generated')).some((path) =>
      path.endsWith('probe.sql.go'),
    )
  )
    throw new Error('sqlc did not generate the probe query');
  const db = join(temp, 'probe.db');
  tool('goose', '-dir', migrations, 'sqlite3', db, 'up');
  tool('goose', '-dir', migrations, 'sqlite3', db, 'down');
  if (files('db/migrations').some((path) => path.endsWith('.sql')))
    tool('goose', '-dir', 'db/migrations', 'validate');
} finally {
  removeTemp(temp);
}
