import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});
it('uses the configured local image policy only in Development', async () => {
  const base = 'http://127.0.0.1:46217/__dev/assets';
  const key = `media/sha256/aa/${'a'.repeat(64)}.png`;
  vi.stubGlobal('__GOPHERATLAS_ASSET_BASE__', base);
  vi.stubEnv('DEV', true);
  vi.resetModules();
  const dev = await import('./asset-policy');
  expect(dev.isControlledImage(`${base}/${key}`)).toBe(true);
  expect(dev.validateMarkdown(`![alt](${base}/${key})`)).toEqual([]);
  expect(
    dev.isControlledImage(`${base.replace('46217', '46218')}/${key}`),
  ).toBe(false);
  vi.stubEnv('DEV', false);
  vi.resetModules();
  const production = await import('./asset-policy');
  expect(production.isControlledImage(`${base}/${key}`)).toBe(false);
  expect(
    production.isControlledImage(`https://assets.gopheratlas.com/${key}`),
  ).toBe(true);
});
