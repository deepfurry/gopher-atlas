import { defineConfig } from 'astro/config';
import { unified } from '@astrojs/markdown-remark';
import stylex from '@stylexjs/unplugin';
import { markdownOptions } from './src/lib/publication/markdown.ts';
import developmentPreview from './dev/integration.mjs';
import publicSitemap from './integrations/public-sitemap.mjs';

export default defineConfig({
  site: 'https://gopheratlas.com',
  output: 'static',
  compressHTML: true,
  trailingSlash: 'always',
  integrations: [developmentPreview(), ...publicSitemap()],
  markdown: {
    processor: unified(markdownOptions),
    shikiConfig: markdownOptions.shikiConfig,
  },
  vite: {
    envDir: false,
    plugins: [
      stylex.vite({
        useCSSLayers: true,
        runtimeInjection: false,
        dev: false,
        devMode: 'css-only',
      }),
    ],
  },
});
