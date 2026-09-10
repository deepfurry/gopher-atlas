import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  cpSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import openapiTS, { astToString } from 'openapi-typescript';
import { parse, stringify } from 'yaml';
import { files, tool, removeTemp } from './lib.mjs';

const check = process.argv.includes('--check');
const output = 'packages/api-client/src/generated/schema.ts';
const generated =
  '// Generated from contracts/openapi.yaml by make generate. Do not edit.\n' +
  astToString(
    await openapiTS(new URL('../contracts/openapi.yaml', import.meta.url)),
  );
if (check) {
  if (
    !existsSync(output) ||
    readFileSync(output, 'utf8').replaceAll('\r\n', '\n') !== generated
  )
    throw new Error('API client drift: run make generate');
} else {
  mkdirSync('packages/api-client/src/generated', { recursive: true });
  writeFileSync(output, generated);
}

const queries = files('db/queries').filter((file) => file.endsWith('.sql'));
const migrations = files('db/migrations').filter((file) =>
  file.endsWith('.sql'),
);
if (queries.length === 0) {
  if (
    existsSync('internal/database/sqlc') &&
    files('internal/database/sqlc').some((file) => file.endsWith('.go'))
  )
    throw new Error('Generated sqlc code has no query source');
  console.log(
    'sqlc runtime generation: no application queries yet (P0-1). Tooling is checked with disposable fixtures.',
  );
} else if (!migrations.length) {
  throw new Error('sqlc queries require migration inputs');
} else if (!check) {
  tool('sqlc', 'generate', '-f', 'sqlc.yaml');
} else {
  const temp = mkdtempSync(join(tmpdir(), 'gopheratlas-sqlc-drift-'));
  try {
    const config = parse(readFileSync('sqlc.yaml', 'utf8'));
    cpSync('db', join(temp, 'db'), { recursive: true });
    config.sql[0].gen.go.out = 'generated';
    const configPath = join(temp, 'sqlc.yaml');
    writeFileSync(configPath, stringify(config));
    tool('sqlc', 'generate', '-f', configPath);
    const expected = files(join(temp, 'generated'))
      .map((file) => file.split('/').at(-1))
      .sort();
    const actual = existsSync('internal/database/sqlc')
      ? files('internal/database/sqlc')
          .map((file) => file.split('/').at(-1))
          .sort()
      : [];
    if (JSON.stringify(actual) !== JSON.stringify(expected))
      throw new Error('sqlc file drift: run make generate');
    for (const name of expected) {
      if (
        readFileSync(join(temp, 'generated', name), 'utf8').replaceAll(
          '\r\n',
          '\n',
        ) !==
        readFileSync(join('internal/database/sqlc', name), 'utf8').replaceAll(
          '\r\n',
          '\n',
        )
      )
        throw new Error('sqlc content drift: run make generate');
    }
  } finally {
    removeTemp(temp);
  }
}
