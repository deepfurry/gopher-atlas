import { setTimeout as delay } from 'node:timers/promises';
import { readLatest, readPrepared } from './prepare-web-content.mjs';
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
    latest = readLatest,
    prepare = readPrepared,
    intervalMs = 2000,
    report = (message) => console.log(message),
  } = {},
) {
  if (env.CONTENT_SNAPSHOT_FILE) return null;
  let generation = initialGeneration,
    polling = false,
    failed = false;
  const poll = async (signal) => {
    if (polling || signal?.aborted) return;
    polling = true;
    try {
      const options = { development: true, signal, timeoutMs: 5000 };
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
    } catch {
      if (!signal?.aborted && !failed)
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
