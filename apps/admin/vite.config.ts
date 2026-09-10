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
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: {
      port: 5173,
      strictPort: true,
      proxy,
    },
  };
});
