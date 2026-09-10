import { defineConfig } from 'astro/config';
import { unified } from '@astrojs/markdown-remark';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import { remarkPlugins } from '@gopheratlas/markdown';

export default defineConfig({
  site: 'https://gopheratlas.com',
  output: 'static',
  trailingSlash: 'always',
  integrations: [react(), sitemap()],
  markdown: {
    processor: unified({ remarkPlugins, smartypants: false }),
    shikiConfig: { themes: { light: 'github-light', dark: 'github-dark' } },
  },
  vite: { plugins: [tailwindcss()] },
});
