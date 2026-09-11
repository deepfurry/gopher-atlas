import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { randomBytes } from 'node:crypto';
import { Readable } from 'node:stream';
import { afterEach, expect, it, vi } from 'vitest';
import {
  developmentEnv,
  publicToolEnv,
  webDevelopmentEnv,
} from '../scripts/dev-env.mjs';
import { prepare } from '../scripts/prepare-web-content.mjs';
import { loadSnapshot, sha256 } from '../scripts/snapshot.mjs';
import { preparationMessage } from '../scripts/dev-web.mjs';
import { packageCLI } from '../scripts/dev-processes.mjs';

const temporary: string[] = [];
afterEach(() => {
  for (const dir of temporary.splice(0))
    rmSync(dir, { recursive: true, force: true });
});
const directory = () => {
  const dir = mkdtempSync(join(tmpdir(), 'gopheratlas-dev-'));
  temporary.push(dir);
  return dir;
};
const credentials = () => ({
  APP_ENV: 'development',
  R2_ENDPOINT: 'https://development.invalid',
  R2_CONTENT_BUCKET: 'development-content',
  R2_ACCESS_KEY_ID: randomBytes(16).toString('hex'),
  R2_SECRET_ACCESS_KEY: randomBytes(24).toString('hex'),
});
const data = readFileSync('tests/fixtures/content-snapshot-v1.json');
const snapshot = JSON.parse(data.toString());
const latest = Buffer.from(
  JSON.stringify({
    schemaVersion: 1,
    generation: snapshot.generation,
    snapshotKey: `snapshots/generation-${snapshot.generation}.json`,
    sha256: sha256(data),
    exportedAt: snapshot.exportedAt,
  }),
);
const output = () => pathToFileURL(directory() + '/');

it('reads only the supplied root .env with process precedence, quotes, empty values and optional absence', () => {
  const root = directory();
  expect(developmentEnv(root, { FROM_PROCESS: 'yes' })).toEqual({
    FROM_PROCESS: 'yes',
  });
  const value = randomBytes(24).toString('hex');
  writeFileSync(
    join(root, '.env'),
    `APP_ENV=development\nR2_SECRET_ACCESS_KEY="${value}"\nCMS_LISTEN_ADDR=127.0.0.1:46217\n`,
  );
  const env = developmentEnv(root, {
    CMS_LISTEN_ADDR: '127.0.0.1:46220',
    R2_SECRET_ACCESS_KEY: '',
  });
  expect(env).toEqual({
    APP_ENV: 'development',
    R2_SECRET_ACCESS_KEY: '',
    CMS_LISTEN_ADDR: '127.0.0.1:46220',
  });
  expect(developmentEnv(root, {}).R2_SECRET_ACCESS_KEY).toBe(value);
});

it('uses per-field CONTENT_R2 precedence and development fallback without mutating inputs', () => {
  const base = credentials(),
    copy = { ...base };
  const got = webDevelopmentEnv(base);
  expect(got.CONTENT_R2_ENDPOINT).toBe(base.R2_ENDPOINT);
  expect(got.CONTENT_R2_BUCKET).toBe(base.R2_CONTENT_BUCKET);
  expect(got.CONTENT_R2_ACCESS_KEY_ID).toBe(base.R2_ACCESS_KEY_ID);
  expect(got.CONTENT_R2_SECRET_ACCESS_KEY).toBe(base.R2_SECRET_ACCESS_KEY);
  expect(base).toEqual(copy);
  const preferred = {
    CONTENT_R2_ENDPOINT: 'https://reader.invalid',
    CONTENT_R2_BUCKET: 'reader-content',
    CONTENT_R2_ACCESS_KEY_ID: randomBytes(16).toString('hex'),
    CONTENT_R2_SECRET_ACCESS_KEY: randomBytes(24).toString('hex'),
  };
  expect(webDevelopmentEnv({ ...base, ...preferred })).toMatchObject(preferred);
  const partial = webDevelopmentEnv({
    ...base,
    CONTENT_R2_BUCKET: 'reader-content',
    CONTENT_R2_ENDPOINT: '',
  });
  expect(partial.CONTENT_R2_BUCKET).toBe('reader-content');
  expect(partial.CONTENT_R2_ENDPOINT).toBe(base.R2_ENDPOINT);
  expect(webDevelopmentEnv({ ...base, APP_ENV: '' }).CONTENT_R2_BUCKET).toBe(
    base.R2_CONTENT_BUCKET,
  );
});

it('does not apply fallback in production or any other environment, including ordinary build loads', async () => {
  for (const APP_ENV of ['production', 'invalid']) {
    const env = { ...credentials(), APP_ENV };
    expect(webDevelopmentEnv(env).CONTENT_R2_ACCESS_KEY_ID).toBeUndefined();
    await expect(loadSnapshot(env)).rejects.toThrow(
      'content_input_not_configured',
    );
    await expect(prepare(env, output())).rejects.toThrow(
      'content_input_not_configured',
    );
  }
  // Even APP_ENV=development does not opt the Production build function into fallback.
  await expect(prepare(credentials(), output())).rejects.toThrow(
    'content_input_not_configured',
  );
});

it('gives explicit fixtures highest priority and resolves dev fixture paths from root without storage', async () => {
  const root = directory();
  writeFileSync(join(root, 'public.json'), data);
  const createClient = vi.fn(() => {
    throw Error('must not contact storage');
  });
  const env = webDevelopmentEnv(
    { ...credentials(), CONTENT_SNAPSHOT_FILE: 'public.json' },
    root,
  );
  const result = await prepare(env, output(), {
    development: true,
    createClient,
  });
  expect(result.hash).toBe(sha256(data));
  expect(createClient).not.toHaveBeenCalled();
  await expect(
    prepare(
      { ...env, CONTENT_SNAPSHOT_FILE: join(root, 'missing.json') },
      output(),
      { development: true, createClient },
    ),
  ).rejects.toThrow();
  expect(createClient).not.toHaveBeenCalled();
});

it('labels only a missing development latest.json, preserves Production errors and hides provider details', async () => {
  const secret = randomBytes(24).toString('hex');
  const env = webDevelopmentEnv(credentials());
  for (const test of [
    {
      development: true,
      name: 'NoSuchKey',
      missingGeneration: false,
      expected: 'no published snapshot available',
    },
    {
      development: false,
      name: 'NoSuchKey',
      missingGeneration: false,
      expected: 'content_snapshot_load_failed',
    },
    {
      development: true,
      name: 'AccessDenied',
      missingGeneration: false,
      expected: 'content_snapshot_load_failed',
    },
    {
      development: true,
      name: 'NoSuchBucket',
      missingGeneration: false,
      expected: 'content_snapshot_load_failed',
    },
    {
      development: true,
      name: 'NoSuchKey',
      missingGeneration: true,
      expected: 'content_snapshot_load_failed',
    },
  ]) {
    const destroy = vi.fn();
    const createClient = () => ({
      destroy,
      send: async (command: { input: { Key: string } }) => {
        if (test.missingGeneration && command.input.Key === 'latest.json')
          return {
            ContentLength: latest.length,
            Body: Readable.from([latest]),
          };
        throw Object.assign(new Error(secret), { name: test.name });
      },
    });
    try {
      await prepare(env, output(), {
        development: test.development,
        createClient,
      });
      expect.fail('expected load failure');
    } catch (error) {
      expect((error as Error).message).toBe(test.expected);
      expect(preparationMessage(error)).not.toContain(secret);
      if (test.expected.startsWith('no published'))
        expect(preparationMessage(error)).toContain('latest.json is missing');
    }
    expect(destroy).toHaveBeenCalledOnce();
  }
});

it('loads through the selected development S3 credentials and writes validated public data only', async () => {
  const env = webDevelopmentEnv(credentials()),
    destination = output();
  const send = vi.fn(
    async (command: { input: { Key: string; Bucket: string } }) => {
      expect(command.input.Bucket).toBe(env.CONTENT_R2_BUCKET);
      const body = command.input.Key === 'latest.json' ? latest : data;
      return { ContentLength: body.length, Body: Readable.from([body]) };
    },
  );
  const destroy = vi.fn();
  const createClient = vi.fn(() => ({ send, destroy }));
  await prepare(env, destination, { development: true, createClient });
  expect(createClient).toHaveBeenCalledWith(
    expect.objectContaining({
      endpoint: env.CONTENT_R2_ENDPOINT,
      credentials: {
        accessKeyId: env.CONTENT_R2_ACCESS_KEY_ID,
        secretAccessKey: env.CONTENT_R2_SECRET_ACCESS_KEY,
      },
    }),
  );
  expect(send).toHaveBeenCalledTimes(2);
  expect(readFileSync(new URL('published-snapshot.json', destination))).toEqual(
    data,
  );
  expect(
    readFileSync(new URL('build-input.json', destination), 'utf8'),
  ).not.toContain(env.CONTENT_R2_SECRET_ACCESS_KEY);
  expect(destroy).toHaveBeenCalledOnce();
});

it('keeps private environment out of Astro/Vite and resolves the existing pinned CLIs', () => {
  const secret = randomBytes(24).toString('hex');
  const filtered = publicToolEnv({
    ...credentials(),
    CONTENT_R2_SECRET_ACCESS_KEY: secret,
    GITHUB_OAUTH_CLIENT_SECRET: secret,
    PUBLIC_SECRET: secret,
    VITE_SECRET: secret,
    CMS_BASE_URL: secret,
    PATH: 'tool-path',
    HOME: 'test-home',
  });
  expect(filtered).toEqual({
    APP_ENV: 'development',
    PATH: 'tool-path',
    HOME: 'test-home',
  });
  for (const [directory, name] of [
    ['apps/web', 'astro'],
    ['apps/admin', 'vite'],
  ])
    expect(
      readFileSync(packageCLI(resolve(directory), name), 'utf8').length,
    ).toBeGreaterThan(0);
});
