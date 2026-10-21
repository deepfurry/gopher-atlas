import { readFileSync } from 'node:fs';
import sitemap from '@astrojs/sitemap';
import { validateSnapshot } from '../../../scripts/snapshot.mjs';
import { hasEnglish } from '../src/lib/publication/editorial.ts';
import { chromePaths, withoutLocale } from '../src/lib/i18n.ts';

// Config loading (including astro check and dev) needs no prepared publication.
// Only a build may read it; missing/invalid input must fail outside sitemap's
// best-effort build:done handler, which can otherwise swallow filter errors.
export default function publicSitemap({
  snapshotFile = new URL(
    '../.generated/published-snapshot.json',
    import.meta.url,
  ),
} = {}) {
  let englishPaths;
  return [
    {
      name: 'gopheratlas-public-sitemap-input',
      hooks: {
        'astro:build:start': () => {
          const snapshot = validateSnapshot(readFileSync(snapshotFile));
          englishPaths = new Set(
            snapshot.content
              .filter(hasEnglish)
              .map((item) => `/en${item.canonicalPath}`),
          );
        },
      },
    },
    sitemap({
      filter: (page) => {
        if (!englishPaths) throw new Error('public_sitemap_not_prepared');
        const path = new URL(page).pathname;
        return (
          !path.endsWith('/404/') &&
          (!path.startsWith('/en/') ||
            chromePaths.includes(withoutLocale(path)) ||
            englishPaths.has(path))
        );
      },
    }),
  ];
}
