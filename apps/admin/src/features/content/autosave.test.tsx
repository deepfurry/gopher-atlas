import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AutosaveQueue } from './autosave';
import { APIError } from '@/shared/api';
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
};
it('debounces rapid changes into one complete snapshot and skips unchanged input', async () => {
  const save = vi.fn(async () => ({ version: 6, updatedAt: 100 }));
  const q = new AutosaveQueue({ body: 'old', tags: [1] }, 5, save);
  q.update({ body: 'old', tags: [1] });
  await vi.advanceTimersByTimeAsync(2000);
  expect(save).not.toHaveBeenCalled();
  q.update({ body: 'a', tags: [2] });
  await vi.advanceTimersByTimeAsync(1000);
  q.update({ body: 'ab', tags: [3] });
  await vi.advanceTimersByTimeAsync(1699);
  expect(save).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(save).toHaveBeenCalledExactlyOnceWith({ body: 'ab', tags: [3] }, 5);
  expect(q.getSnapshot()).toMatchObject({
    version: 6,
    dirty: false,
    status: 'saved',
  });
  q.dispose();
});
it('allows only one request in flight and uses returned version for coalesced edits', async () => {
  const first = deferred<{ version: number; updatedAt: number }>();
  const second = deferred<{ version: number; updatedAt: number }>();
  const save = vi
    .fn()
    .mockReturnValueOnce(first.promise)
    .mockReturnValueOnce(second.promise);
  const q = new AutosaveQueue({ body: 'old' }, 5, save);
  q.update({ body: 'a' });
  const flush = q.flush();
  q.update({ body: 'ab' });
  q.update({ body: 'abc' });
  const manual = q.flush();
  expect(manual).toBe(flush);
  expect(save).toHaveBeenCalledTimes(1);
  first.resolve({ version: 6, updatedAt: 1 });
  await vi.advanceTimersByTimeAsync(0);
  expect(save).toHaveBeenNthCalledWith(2, { body: 'abc' }, 6);
  q.update({ body: 'abc' });
  second.resolve({ version: 7, updatedAt: 2 });
  expect(await flush).toBe(7);
  expect(save).toHaveBeenCalledTimes(2);
  q.dispose();
});
it('pauses after conflict, preserves edits, requires explicit reload and never retries a stale version', async () => {
  const error = new APIError('content_version_conflict', 'Conflict');
  const save = vi
    .fn()
    .mockRejectedValueOnce(error)
    .mockResolvedValue({ version: 10, updatedAt: 2 });
  const q = new AutosaveQueue({ body: 'old' }, 5, save);
  q.update({ body: 'local' });
  await expect(q.flush()).rejects.toBe(error);
  q.update({ body: 'still local' });
  await vi.advanceTimersByTimeAsync(9000);
  await expect(q.flush()).rejects.toBe(error);
  expect(save).toHaveBeenCalledTimes(1);
  expect(q.getSnapshot()).toMatchObject({
    status: 'conflict',
    dirty: true,
    version: 5,
  });
  q.reload({ body: 'server' }, 9, 1);
  q.update({ body: 'resolved' });
  await q.flush();
  expect(save).toHaveBeenLastCalledWith({ body: 'resolved' }, 9);
  q.dispose();
});
it('does not blindly retry failures; explicit manual retry uses the current pending snapshot', async () => {
  const save = vi
    .fn()
    .mockRejectedValueOnce(new APIError('csrf_invalid', 'Invalid'))
    .mockResolvedValue({ version: 2, updatedAt: 2 });
  const q = new AutosaveQueue({ body: 'old' }, 1, save);
  q.update({ body: 'local' });
  await expect(q.flush()).rejects.toThrow();
  q.update({ body: 'new edit' });
  await vi.advanceTimersByTimeAsync(5000);
  expect(save).toHaveBeenCalledTimes(1);
  await q.flush();
  expect(save).toHaveBeenLastCalledWith({ body: 'new edit' }, 1);
  q.dispose();
});
it('never autosaves in_review or after disposal', async () => {
  const save = vi.fn(async () => ({ version: 2, updatedAt: 2 }));
  const q = new AutosaveQueue({ body: 'old' }, 1, save);
  q.setEnabled(false);
  q.update({ body: 'local' });
  await vi.advanceTimersByTimeAsync(3000);
  await expect(q.flush()).rejects.toThrow('read-only');
  expect(save).not.toHaveBeenCalled();
  q.dispose();
});
it('does not save a reverted snapshot and flush resolves the acknowledged version', async () => {
  const save = vi.fn(async () => ({ version: 2, updatedAt: 2 }));
  const q = new AutosaveQueue({ body: 'old' }, 1, save);
  q.update({ body: 'new' });
  q.update({ body: 'old' });
  expect(await q.flush()).toBe(1);
  expect(save).not.toHaveBeenCalled();
  q.dispose();
});
