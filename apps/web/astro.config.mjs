import { defineConfig } from 'astro/config';
import { unified } from '@astrojs/markdown-remark';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import { markdownOptions } from './src/lib/publication/markdown.ts';
import developmentPreview from './dev/integration.mjs';
import { chromePaths, withoutLocale } from './src/lib/i18n.ts';

export default defineConfig({
  site: 'https://gopheratlas.com',
  output: 'static',
  trailingSlash: 'always',
  integrations: [
    developmentPreview(),
    react(),
    sitemap({
      filter: (page) => {
        const path = new URL(page).pathname;
        return (
          !path.endsWith('/404/') &&
          (!path.startsWith('/en/') ||
            chromePaths.includes(withoutLocale(path)))
        );
      },
    }),
  ],
  markdown: {
    processor: unified(markdownOptions),
    shikiConfig: markdownOptions.shikiConfig,
  },
  vite: { envDir: false, plugins: [tailwindcss()] },
});
