import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ command, mode }) => {
  // Only dev serving reads the non-secret proxy address. Builds never load root .env.
  const env =
    command === 'serve'
      ? loadEnv(
          mode,
          fileURLToPath(new URL('../..', import.meta.url)),
          'CMS_LISTEN_ADDR',
        )
      : {};
  const address =
    process.env.CMS_LISTEN_ADDR || env.CMS_LISTEN_ADDR || '127.0.0.1:46217';
  const target = `http://${address}`;
  const proxy = Object.fromEntries(
    ['/api', '/ops', '/healthz', '/readyz'].map((path) => [
      path,
      { target, changeOrigin: false },
    ]),
  );
  return {
    envDir: false,
    define: {
      __GOPHERATLAS_ASSET_BASE__: JSON.stringify(
        command === 'serve' ? `${target}/__dev/assets` : '',
      ),
    },
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'editorial-preview-boundary',
        generateBundle() {
          for (const id of this.getModuleIds()) {
            if (
              /\/(?:rehype-raw|@radix-ui|@react-aria|codemirror|@codemirror|monaco-editor|@tiptap|prosemirror[^/]*)\//u.test(
                id.replaceAll('\\', '/'),
              )
            )
              this.error(
                'Forbidden editor/preview dependency entered the production bundle.',
              );
          }
        },
      },
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
        '@uiw/react-markdown-preview/nohighlight': fileURLToPath(
          new URL('./src/shared/md-editor-preview.tsx', import.meta.url),
        ),
      },
    },
    server: {
      port: 5173,
      strictPort: true,
      proxy,
    },
  };
});
