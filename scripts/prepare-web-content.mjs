import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadSnapshot } from './snapshot.mjs';

export async function prepare(
  env = process.env,
  output = new URL('../apps/web/.generated/', import.meta.url),
  {
    development = false,
    createClient = (options) => new S3Client(options),
  } = {},
) {
  let client;
  let missingLatest = false;
  // This script is a private Node build step. Astro never imports the S3 SDK or credentials.
  if (!env.CONTENT_SNAPSHOT_FILE && env.CONTENT_R2_ENDPOINT)
    client = createClient({
      region: 'auto',
      endpoint: env.CONTENT_R2_ENDPOINT,
      forcePathStyle: true,
      maxAttempts: 2,
      credentials: {
        accessKeyId: env.CONTENT_R2_ACCESS_KEY_ID ?? '',
        secretAccessKey: env.CONTENT_R2_SECRET_ACCESS_KEY ?? '',
      },
    });
  try {
    const result = await loadSnapshot(env, {
      get: async (key, limit) => {
        let response;
        try {
          response = await client.send(
            new GetObjectCommand({ Bucket: env.CONTENT_R2_BUCKET, Key: key }),
            { abortSignal: AbortSignal.timeout(30000) },
          );
        } catch (error) {
          // Missing buckets, forbidden access and missing immutable generations
          // are not equivalent to an as-yet unpublished development bucket.
          missingLatest =
            development && key === 'latest.json' && error.name === 'NoSuchKey';
          throw error;
        }
        try {
          if (response.ContentLength > limit || !response.Body)
            throw new Error('content_size_limit');
          let size = 0;
          const chunks = [];
          for await (const chunk of response.Body) {
            size += chunk.length;
            if (size > limit) throw new Error('content_size_limit');
            chunks.push(chunk);
          }
          return Buffer.concat(chunks);
        } finally {
          response.Body?.destroy();
        }
      },
    });
    mkdirSync(output, { recursive: true });
    writeFileSync(new URL('published-snapshot.json', output), result.data);
    writeFileSync(
      new URL('build-input.json', output),
      JSON.stringify({
        generation: result.snapshot.generation,
        snapshotSha256: result.hash,
      }),
    );
    return result;
  } catch (error) {
    if (missingLatest) throw new Error('no published snapshot available');
    throw error;
  } finally {
    client?.destroy();
  }
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  // An explicit relative fixture is resolved from the invoking working directory.
  try {
    await prepare();
    console.log('Validated public snapshot prepared.');
  } catch {
    console.error(
      'Web content preparation failed; check explicit input/configuration and snapshot integrity.',
    );
    process.exitCode = 1;
  }
}
