import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import {
  parsePreview,
  readPreviewRequest,
  previewLimit,
} from '../apps/web/dev/preview';
import integration from '../apps/web/dev/integration.mjs';
import { createPublication } from '../apps/web/src/lib/publication/indexes';
import { validateContentInput } from '../scripts/snapshot.mjs';
const snapshot = JSON.parse(
  readFileSync('tests/fixtures/content-snapshot-v1.json', 'utf8'),
);
const base = createPublication(snapshot);
function input() {
  const item = structuredClone(
    snapshot.content.find((row: { type: string }) => row.type === 'post'),
  );
  return {
    item,
    author: structuredClone(base.authorById.get(item.authorId)),
    tags: item.tagIds.map((id: number) =>
      structuredClone(base.tagById.get(id)),
    ),
    cover:
      item.coverAssetId === null
        ? null
        : structuredClone(base.assetById.get(item.coverAssetId)),
    targets: [],
  };
}
it('uses Public ContentDetail/Layout and safe Markdown with no preview persistence or external calls', () => {
  const before = JSON.stringify(base.snapshot),
    value = input();
  value.item.bodyMarkdown = '## Latest private Draft';
  const fetch = vi.spyOn(globalThis, 'fetch');
  const parsed = parsePreview(value, base);
  expect(parsed.item.bodyMarkdown).toContain('Latest private Draft');
  expect(JSON.stringify(base.snapshot)).toBe(before);
  expect(fetch).not.toHaveBeenCalled();
  fetch.mockRestore();
  const page = readFileSync('apps/web/dev/preview.astro', 'utf8');
  expect(page).toContain('../src/components/ContentDetail.astro');
  expect(page).toContain('private, no-store');
  expect(page).not.toMatch(/writeFile|fetch\(|generation\+|R2_/);
});
it('rejects private fields, unsafe Markdown/images and mismatched relations', () => {
  for (const change of [
    (v: ReturnType<typeof input>) => {
      v.item.bodyMarkdown = '![secret](https://third-party.invalid/img.png)';
    },
    (v: ReturnType<typeof input>) => {
      v.author!.role = 'admin';
    },
    (v: ReturnType<typeof input>) => {
      v.item.authorId = 99999;
    },
    (v: ReturnType<typeof input>) => {
      v.item.bodyMarkdown = '<script>bad</script>';
    },
  ]) {
    const value = input();
    change(value);
    expect(() => parsePreview(value, base)).toThrow();
  }
});
const origin = 'http://127.0.0.1:5173';
function request(body: string, headers: HeadersInit = {}, method = 'POST') {
  return new Request('http://127.0.0.1:4321/__dev/blog-preview/', {
    method,
    headers: {
      Origin: origin,
      'Content-Type': 'application/x-www-form-urlencoded',
      ...headers,
    },
    ...(method === 'POST' ? { body } : {}),
  });
}
it('accepts only bounded same-Admin-origin POST data', async () => {
  const value = input(),
    body = new URLSearchParams({ preview: JSON.stringify(value) }).toString();
  expect(await readPreviewRequest(request(body), origin)).toEqual(value);
  expect(
    await readPreviewRequest(
      request(body, { Origin: 'http://127.0.0.1:4321' }),
      origin,
    ),
  ).toEqual(value);
  await expect(
    readPreviewRequest(request(body, { Origin: 'null' }), origin),
  ).rejects.toThrow();
  await expect(
    readPreviewRequest(
      request(body, { Origin: 'https://evil.invalid' }),
      origin,
    ),
  ).rejects.toThrow();
  await expect(
    readPreviewRequest(request('', {}, 'GET'), origin),
  ).rejects.toThrow();
  await expect(
    readPreviewRequest(
      request(body, { 'Content-Length': String(previewLimit + 1) }),
      origin,
    ),
  ).rejects.toThrow();
  await expect(
    readPreviewRequest(request('x'.repeat(previewLimit + 1)), origin),
  ).rejects.toThrow();
});
it('registers the renderer only for Astro dev, never build or preview', () => {
  for (const command of ['build', 'preview', 'dev']) {
    const injectRoute = vi.fn(),
      updateConfig = vi.fn();
    integration().hooks['astro:config:setup']({
      command,
      injectRoute,
      updateConfig,
    });
    expect(injectRoute).toHaveBeenCalledTimes(command === 'dev' ? 1 : 0);
    expect(updateConfig).toHaveBeenCalledTimes(command === 'dev' ? 1 : 0);
  }
});
it('permits HTTP only for a Development loopback storage substitute', () => {
  const env = {
    CONTENT_R2_ENDPOINT: 'http://127.0.0.1:46320',
    CONTENT_R2_BUCKET: 'content',
    CONTENT_R2_ACCESS_KEY_ID: 'synthetic',
    CONTENT_R2_SECRET_ACCESS_KEY: 'synthetic',
  };
  expect(() => validateContentInput(env, { development: true })).not.toThrow();
  expect(() => validateContentInput(env)).toThrow();
  expect(() =>
    validateContentInput(
      { ...env, CONTENT_R2_ENDPOINT: 'http://external.invalid' },
      { development: true },
    ),
  ).toThrow();
});
