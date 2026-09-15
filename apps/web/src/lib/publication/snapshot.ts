import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { validateSnapshot } from '../../../../../scripts/snapshot.mjs';
import { createPublication } from './indexes.ts';
import type { Snapshot } from './types.ts';
import { assetPolicy } from './asset-policy';

// Build/server module only. No environment lookup, API call or fixture fallback.
// Revalidate the generated file so a direct Astro invocation cannot accept corrupt input.
export const publication = createPublication(
  validateSnapshot(
    readFileSync(resolve('.generated/published-snapshot.json')),
    { assetPolicy },
  ) as Snapshot,
);
