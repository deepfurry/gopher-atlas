import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import { createSnapshotWatcher } from '../scripts/dev-snapshot-watcher.mjs';
import { sha256 } from '../scripts/snapshot.mjs';

const value = JSON.parse(
  readFileSync('tests/fixtures/content-snapshot-v1.json', 'utf8'),
);
const result = (generation: number) => {
  const snapshot = { ...structuredClone(value), generation },
    data = Buffer.from(JSON.stringify(snapshot));
  return { snapshot, data, hash: sha256(data) };
};
const env = { CONTENT_R2_BUCKET: 'configured-content' };
it('does nothing when generation is unchanged, including concurrent polls', async () => {
  const latest = vi.fn(async () => ({ generation: 1 })),
    prepare = vi.fn(),
    update = vi.fn();
  const watcher = createSnapshotWatcher(env, 1, update, { latest, prepare });
  await Promise.all([watcher.poll(), watcher.poll()]);
  expect(latest).toHaveBeenCalledTimes(1);
  expect(prepare).not.toHaveBeenCalled();
  expect(update).not.toHaveBeenCalled();
});
it('prepares and updates a changed generation once, using the actually loaded generation', async () => {
  const latest = vi.fn(async () => ({ generation: 2 })),
    prepare = vi.fn(async () => result(3));
  const update = vi.fn(),
    report = vi.fn();
  const watcher = createSnapshotWatcher(env, 1, update, {
    latest,
    prepare,
    report,
  });
  await watcher.poll();
  expect(update).toHaveBeenCalledWith(result(3));
  latest.mockResolvedValue({ generation: 3 });
  await watcher.poll();
  expect(update).toHaveBeenCalledTimes(1);
  expect(report).toHaveBeenCalledWith('Public Web refreshed to generation 3.');
});
it('retries after poll/prepare/restart failures without recording success or exposing errors', async () => {
  const latest = vi
    .fn()
    .mockRejectedValueOnce(new Error('synthetic-private-detail'))
    .mockResolvedValue({ generation: 2 });
  const prepare = vi
    .fn()
    .mockRejectedValueOnce(new Error('synthetic-private-detail'))
    .mockResolvedValue(result(2));
  const update = vi
      .fn()
      .mockRejectedValueOnce(new Error('restart unavailable'))
      .mockResolvedValue(undefined),
    report = vi.fn();
  const watcher = createSnapshotWatcher(env, 1, update, {
    latest,
    prepare,
    report,
  });
  for (let n = 0; n < 5; n++) await watcher.poll();
  expect(prepare).toHaveBeenCalledTimes(3);
  expect(update).toHaveBeenCalledTimes(2);
  expect(JSON.stringify(report.mock.calls)).not.toContain(
    'synthetic-private-detail',
  );
});
it('retains the current input when the new public graph is invalid', async () => {
  const broken = result(2);
  broken.snapshot.content[0].authorId = 99999;
  const update = vi.fn();
  await createSnapshotWatcher(env, 1, update, {
    latest: async () => ({ generation: 2 }),
    prepare: async () => broken,
    report: vi.fn(),
  }).poll();
  expect(update).not.toHaveBeenCalled();
});
it('does not start a watcher for explicit fixtures and cancels pending refreshes', async () => {
  const latest = vi.fn(),
    prepare = vi.fn(),
    update = vi.fn();
  expect(
    createSnapshotWatcher(
      { ...env, CONTENT_SNAPSHOT_FILE: 'fixture.json' },
      1,
      update,
      { latest, prepare },
    ),
  ).toBeNull();
  const controller = new AbortController();
  controller.abort();
  const watcher = createSnapshotWatcher(env, 1, update, { latest, prepare });
  await watcher.run(controller.signal);
  await watcher.poll(controller.signal);
  expect(latest).not.toHaveBeenCalled();
  expect(update).not.toHaveBeenCalled();
});
