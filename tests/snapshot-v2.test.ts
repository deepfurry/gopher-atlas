import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { expect, it } from 'vitest';
import {
  validateSnapshot,
  validateLatest,
  loadSnapshot,
  sha256,
} from '../scripts/snapshot.mjs';
import { buildMarker } from '../scripts/build-web.mjs';
import {
  localDevelopment,
  readLocalPrepared,
} from '../scripts/dev-storage.mjs';
import { createPublication } from '../apps/web/src/lib/publication/indexes';
import { normalizeSnapshot } from '../apps/web/src/lib/publication/normalize';
import {
  publicPages,
  redirects,
  collectionText,
  collectionPages,
} from '../apps/web/src/lib/publication/routes';
import { taxonomyText } from '../apps/web/src/lib/publication/taxonomy';
import type {
  SnapshotV1,
  SnapshotV2,
} from '../apps/web/src/lib/publication/types';

const bytes = (value: unknown) => Buffer.from(JSON.stringify(value));
const fixture = (version: number) =>
  readFileSync(`tests/fixtures/content-snapshot-v${version}.json`);
const v2 = (): SnapshotV2 => JSON.parse(fixture(2).toString());
const pointer = (data: Buffer) => {
  const s = JSON.parse(data.toString());
  return {
    schemaVersion: s.schemaVersion,
    generation: s.generation,
    exportedAt: s.exportedAt,
    snapshotKey: `snapshots/generation-${s.generation}.json`,
    sha256: sha256(data),
  };
};
const remote = {
  CONTENT_R2_ENDPOINT: 'https://r2.invalid',
  CONTENT_R2_BUCKET: 'fixture-content',
  CONTENT_R2_ACCESS_KEY_ID: 'synthetic-key',
  CONTENT_R2_SECRET_ACCESS_KEY: 'synthetic-secret',
};

it('retains the v1 definitions and all unchanged v2 public wire fields', () => {
  const old = JSON.parse(
    readFileSync('contracts/content-snapshot.schema.json', 'utf8'),
  );
  const modern = JSON.parse(
    readFileSync('contracts/content-snapshot.v2.schema.json', 'utf8'),
  );
  for (const name of Object.keys(old.$defs).filter(
    (key) => !['tag', 'note'].includes(key),
  ))
    expect(modern.$defs[name]).toEqual(old.$defs[name]);
  for (const name of Object.keys(old.properties).filter(
    (key) => key !== 'schemaVersion',
  ))
    expect(modern.properties[name]).toEqual(old.properties[name]);
  for (const name of Object.keys(old.$defs.tag.properties))
    expect(modern.$defs.tag.properties[name]).toEqual(
      old.$defs.tag.properties[name],
    );
  expect(old.$defs.note.required).toContain('groupDescription');
  expect(modern.$defs.note.required).toEqual(['groupSlug', 'order']);
});

it('uses independent v2 group metadata and stable order without mutating either input', () => {
  const s = v2();
  s.groups[1].order = 0;
  s.groups[0].order = 2;
  s.groups[0].name = '新的分组展示名';
  const before = JSON.stringify(s),
    p = createPublication(validateSnapshot(bytes(s)));
  expect(p.groups.map((g) => g.slug)).toEqual(['engineering-practice', 'go']);
  expect(p.notesByGroup.get('go')?.name).toBe('新的分组展示名');
  expect(p.contentByType.get('note')?.map((c) => c.id)).toEqual([7, 5, 2]);
  const reversed = structuredClone(s);
  for (const key of ['authors', 'tags', 'groups', 'content', 'routes'] as const)
    reversed[key].reverse();
  const other = createPublication(validateSnapshot(bytes(reversed)));
  expect(other.groups).toEqual(p.groups);
  expect(other.feed).toEqual(p.feed);
  expect(JSON.stringify(s)).toBe(before);
});

it.each([1, 2])(
  'loads v%i unchanged through explicit fixture, fake remote and local file boundaries',
  async (version) => {
    const data = fixture(version),
      latest = pointer(data);
    const input = await loadSnapshot({
      CONTENT_SNAPSHOT_FILE: `tests/fixtures/content-snapshot-v${version}.json`,
    });
    expect(input.data).toEqual(data);
    expect(input.snapshot).toEqual(JSON.parse(data.toString()));
    expect(validateLatest(bytes(latest))).toEqual(latest);
    const get = async (key: string) =>
      key === 'latest.json' ? bytes(latest) : data;
    expect((await loadSnapshot(remote, { get })).hash).toBe(sha256(data));
    expect(buildMarker(input, 'a'.repeat(40)).schemaVersion).toBe(version);
    const dir = mkdtempSync(join(tmpdir(), 'gopheratlas-b1-'));
    try {
      const config = localDevelopment({ DATABASE_PATH: join(dir, 'cms.db') });
      const localData = Buffer.from(
        data
          .toString()
          .replaceAll('https://assets.gopheratlas.com', config.assetBase),
      );
      const localLatest = pointer(localData);
      mkdirSync(join(config.contentRoot, 'snapshots'), { recursive: true });
      writeFileSync(
        join(config.contentRoot, localLatest.snapshotKey),
        localData,
      );
      writeFileSync(
        join(config.contentRoot, 'latest.json'),
        bytes(localLatest),
      );
      expect((await readLocalPrepared(config)).data).toEqual(localData);
      const mismatch = { ...latest, schemaVersion: version === 1 ? 2 : 1 };
      writeFileSync(
        join(config.contentRoot, 'latest.json'),
        bytes({ ...localLatest, schemaVersion: mismatch.schemaVersion }),
      );
      await expect(readLocalPrepared(config)).rejects.toThrow(
        'local_snapshot_invalid',
      );
      for (const bad of [mismatch, { ...latest, sha256: 'f'.repeat(64) }])
        await expect(
          loadSnapshot(remote, {
            get: async (key: string) =>
              key === 'latest.json' ? bytes(bad) : data,
          }),
        ).rejects.toThrow('content_snapshot_load_failed');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

it('adapts v1 once without changing input, body, paths, IDs, dates, order or feed', () => {
  const old = validateSnapshot(fixture(1)) as SnapshotV1,
    before = JSON.stringify(old);
  const model = normalizeSnapshot(old),
    publication = createPublication(old);
  expect(model.groups).toEqual([
    {
      id: null,
      slug: 'go',
      name: 'Go',
      description: '',
      nameEn: '',
      descriptionEn: '',
      order: 0,
    },
  ]);
  expect(model.tags.map((tag) => taxonomyText(tag, 'en'))).toEqual(
    old.tags.map(({ name, description }) => ({ name, description })),
  );
  for (const item of model.content) {
    const original = old.content.find((row) => row.id === item.id)!;
    expect({ ...item, payload: original.payload }).toEqual(original);
    if (item.type === 'note')
      expect(Object.keys(item.payload).sort()).toEqual(['groupSlug', 'order']);
  }
  const modern = v2();
  // Equal publications in the two wire formats have equal static identities/order.
  modern.tags = modern.tags.filter((t) => t.id !== 3);
  modern.content = modern.content.filter((c) => c.id !== 7);
  for (const item of modern.content)
    item.tagIds = [
      ...old.content.find((original) => original.id === item.id)!.tagIds,
    ];
  modern.routes = modern.routes.filter((r) => r.contentId !== 7);
  modern.groups = modern.groups.filter((g) => g.slug === 'go');
  const other = createPublication(validateSnapshot(bytes(modern)));
  expect(publicPages(other).map((p) => p.path)).toEqual(
    publicPages(publication).map((p) => p.path),
  );
  expect(other.feed).toEqual(publication.feed);
  expect(other.notesByGroup.get('go')?.content.map((c) => c.id)).toEqual([
    5, 2,
  ]);
  expect(redirects(other.snapshot)).toEqual(redirects(old));
  expect(JSON.stringify(old)).toBe(before);
});

it('chooses each translated field independently for collection pages and paginated SEO', () => {
  const text = {
    name: '中文名',
    description: '中文说明',
    nameEn: 'English',
    descriptionEn: '',
  };
  expect(taxonomyText(text, 'zh')).toEqual({
    name: '中文名',
    description: '中文说明',
  });
  expect(taxonomyText(text, 'en')).toEqual({
    name: 'English',
    description: '中文说明',
  });
  expect(
    taxonomyText({ ...text, nameEn: '', descriptionEn: 'Description' }, 'en'),
  ).toEqual({ name: '中文名', description: 'Description' });
  expect(
    taxonomyText({ ...text, nameEn: ' ', descriptionEn: '\t' }, 'en'),
  ).toEqual(taxonomyText(text, 'zh'));
  const p = createPublication(validateSnapshot(fixture(2)));
  const group = p.groups[0];
  const pages = collectionPages(
    `/notes/${group.slug}/`,
    group.name,
    '',
    Array(25).fill(group.content[0]),
    { group },
  );
  expect(pages[1].path).toBe('/notes/go/page/2/');
  expect(collectionText(pages[1], 'en')).toEqual({
    title: 'Go Engineering',
    description: 'Go 学习与实验。',
  });
  expect(p.groups[1].content[0].bodyMarkdown).toContain(
    '分类翻译不改变正文语言。',
  );
});

it.each([0, 3, '2', null, [], {}, '__proto__'])(
  'rejects unknown or non-numeric version %j',
  (schemaVersion) => {
    expect(() => validateSnapshot(bytes({ ...v2(), schemaVersion }))).toThrow(
      'snapshot_invalid',
    );
    expect(() =>
      validateLatest(bytes({ ...pointer(fixture(2)), schemaVersion })),
    ).toThrow('snapshot_invalid');
  },
);

const invalidV2: [string, (s: SnapshotV2) => void][] = [
  [
    'duplicate group slug',
    (s) => {
      s.groups[1].slug = s.groups[0].slug;
    },
  ],
  [
    'duplicate group ID',
    (s) => {
      s.groups[1].id = s.groups[0].id;
    },
  ],
  [
    'missing group',
    (s) => {
      s.groups.pop();
    },
  ],
  [
    'unused group',
    (s) => {
      s.groups.push({ ...s.groups[0], id: 99, slug: 'unused' });
    },
  ],
  [
    'invalid group slug',
    (s) => {
      s.groups[0].slug = 'Bad Slug';
    },
  ],
  [
    'negative group order',
    (s) => {
      s.groups[0].order = -1;
    },
  ],
  [
    'fractional group order',
    (s) => {
      s.groups[0].order = 1.2;
    },
  ],
  [
    'missing translation field',
    (s) => {
      Reflect.deleteProperty(s.tags[0], 'nameEn');
    },
  ],
  [
    'oversized translation',
    (s) => {
      s.tags[0].nameEn = 'a'.repeat(101);
    },
  ],
  [
    'duplicate tag slug',
    (s) => {
      s.tags[1].slug = s.tags[0].slug;
    },
  ],
  [
    'duplicate tag ID',
    (s) => {
      s.tags[1].id = s.tags[0].id;
    },
  ],
  [
    'missing tag',
    (s) => {
      s.tags.pop();
    },
  ],
  [
    'private group field',
    (s) => {
      Object.assign(s.groups[0], { secret: 'private' });
    },
  ],
  [
    'private tag field',
    (s) => {
      Object.assign(s.tags[0], { secret: 'private' });
    },
  ],
  [
    'legacy note mirror',
    (s) => {
      Object.assign(s.content.find((c) => c.type === 'note')!.payload, {
        group: 'old',
      });
    },
  ],
  [
    'private top-level field',
    (s) => {
      Object.assign(s, { drafts: [] });
    },
  ],
  [
    'invalid content reference',
    (s) => {
      s.routes[0].contentId = 999;
    },
  ],
  [
    'invalid topic target',
    (s) => {
      s.content.find(
        (c) => c.type === 'topic',
      )!.topicEntries[0].targetContentId = 999;
    },
  ],
  [
    'unsafe Markdown',
    (s) => {
      s.content[0].bodyMarkdown = '<script>private</script>';
    },
  ],
];
it.each(invalidV2)('fails closed on %s', (_, mutate) => {
  const s = v2();
  mutate(s);
  expect(() => validateSnapshot(bytes(s))).toThrow('snapshot_invalid');
});

it('keeps v1 closed and rejects conflicting legacy metadata before adaptation', () => {
  const s = JSON.parse(fixture(1).toString());
  expect(() => validateSnapshot(bytes({ ...s, groups: [] }))).toThrow();
  s.tags[0].nameEn = 'not v1';
  expect(() => validateSnapshot(bytes(s))).toThrow();
  delete s.tags[0].nameEn;
  s.content.find((c: { id: number }) => c.id === 5).payload.groupOrder = 9;
  expect(() => validateSnapshot(bytes(s))).toThrow();
});

it('rejects derived group pagination route collisions in the build graph', () => {
  const s = v2();
  // Defense in depth: a direct graph caller cannot reserve a collection's second page.
  for (let i = 10; i < 35; i++) {
    const original = s.content.find((c) => c.type === 'note')!;
    const item = {
      ...original,
      id: i,
      slug: `note-${i}`,
      canonicalPath: `/notes/go/note-${i}/`,
    };
    s.content.push(item);
    s.routes.push({
      path: item.canonicalPath,
      kind: 'canonical',
      contentId: i,
    });
  }
  s.routes.push({ path: '/notes/go/page/2/', kind: 'redirect', contentId: 7 });
  expect(() => publicPages(createPublication(s))).toThrow(
    'public_page_conflict',
  );
});

it('aborts the actual build before Astro for unknown versions, duplicate groups and missing references', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gopheratlas-b1-build-'));
  try {
    for (const mutate of [
      (s: SnapshotV2) => Object.assign(s, { schemaVersion: 99 }),
      invalidV2[0][1],
      invalidV2[2][1],
    ]) {
      const s = v2();
      mutate(s);
      const file = join(dir, 'invalid.json');
      writeFileSync(file, bytes(s));
      const result = spawnSync(
        process.execPath,
        ['../../scripts/build-web.mjs'],
        {
          cwd: resolve('apps/web'),
          env: { ...process.env, CONTENT_SNAPSHOT_FILE: file },
          encoding: 'utf8',
          timeout: 10000,
        },
      );
      expect(result.error).toBeUndefined();
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('snapshot_invalid');
      expect(result.stdout).not.toContain('Generating static routes');
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
