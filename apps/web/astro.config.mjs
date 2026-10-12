import { defineConfig } from 'astro/config';
import { unified } from '@astrojs/markdown-remark';
import sitemap from '@astrojs/sitemap';
import stylex from '@stylexjs/unplugin';
import { markdownOptions } from './src/lib/publication/markdown.ts';
import developmentPreview from './dev/integration.mjs';
import { chromePaths, withoutLocale } from './src/lib/i18n.ts';

export default defineConfig({
  site: 'https://gopheratlas.com',
  output: 'static',
  compressHTML: true,
  trailingSlash: 'always',
  integrations: [
    developmentPreview(),
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
