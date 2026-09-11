import { defineConfig } from 'astro/config';
import { unified } from '@astrojs/markdown-remark';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import { markdownOptions } from './src/lib/publication/markdown.ts';

export default defineConfig({
  site: 'https://gopheratlas.com',
  output: 'static',
  trailingSlash: 'always',
  integrations: [
    react(),
    sitemap({ filter: (page) => !page.endsWith('/404/') }),
  ],
  markdown: {
    processor: unified(markdownOptions),
    shikiConfig: markdownOptions.shikiConfig,
  },
  vite: { envDir: false, plugins: [tailwindcss()] },
});
