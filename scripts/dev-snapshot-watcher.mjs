import { setTimeout as delay } from 'node:timers/promises';
import { readLocalLatest, readLocalPrepared } from './dev-storage.mjs';
import { createPublication } from '../apps/web/src/lib/publication/indexes.ts';
import { publicPages } from '../apps/web/src/lib/publication/routes.ts';

export function validateDevelopmentPublication(result) {
  publicPages(createPublication(result.snapshot));
  return result;
}

export function createSnapshotWatcher(
  env,
  initialGeneration,
  update,
  {
    latest = readLocalLatest,
    prepare = readLocalPrepared,
    intervalMs = 750,
    report = (message) => console.log(message),
  } = {},
) {
  if (env.CONTENT_SNAPSHOT_FILE)
    throw new Error(
      'CONTENT_SNAPSHOT_FILE is test-only; remove it for normal development.',
    );
  let generation = initialGeneration,
    polling = false,
    failed = false;
  const poll = async (signal) => {
    if (polling || signal?.aborted) return;
    polling = true;
    try {
      const options = { signal };
      const pointer = await latest(env, options);
      if (pointer.generation !== generation) {
        const result = validateDevelopmentPublication(
          await prepare(env, options),
        );
        if (signal?.aborted) return;
        await update(result);
        generation = result.snapshot.generation;
        report(`Public Web refreshed to generation ${generation}.`);
      }
      failed = false;
    } catch (error) {
      if (
        !signal?.aborted &&
        !failed &&
        error.message !== 'local_snapshot_missing'
      )
        report(
          'Public Web snapshot refresh unavailable; keeping the current content and retrying.',
        );
      failed = true;
    } finally {
      polling = false;
    }
  };
  return {
    poll,
    async run(signal) {
      while (!signal.aborted) {
        await poll(signal);
        try {
          await delay(intervalMs, undefined, { signal });
        } catch {
          break;
        }
      }
    },
  };
}
