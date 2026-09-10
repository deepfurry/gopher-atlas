import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { removeTemp } from '../scripts/lib.mjs';

it('optional local env loading preserves process variables and tolerates a missing file', () => {
  const directory = mkdtempSync(join(tmpdir(), 'gopheratlas-env-test-'));
  try {
    const file = join(directory, '.env');
    writeFileSync(
      file,
      'GOPHERATLAS_TEST_ENV=file\nGOPHERATLAS_TEST_FALLBACK=local\n',
    );
    const result = execFileSync(
      process.execPath,
      [
        `--env-file-if-exists=${file}`,
        '-e',
        'process.stdout.write(JSON.stringify([process.env.GOPHERATLAS_TEST_ENV, process.env.GOPHERATLAS_TEST_FALLBACK]))',
      ],
      {
        encoding: 'utf8',
        env: { ...process.env, GOPHERATLAS_TEST_ENV: 'process' },
      },
    );
    expect(JSON.parse(result)).toEqual(['process', 'local']);
    execFileSync(
      process.execPath,
      [
        `--env-file-if-exists=${join(directory, 'missing.env')}`,
        '-e',
        'process.exit(0)',
      ],
      { stdio: 'ignore' },
    );
  } finally {
    removeTemp(directory);
  }
});
