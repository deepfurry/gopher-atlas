import { fileURLToPath } from 'node:url';

export default function developmentPreview() {
  return {
    name: 'gopheratlas-development-preview',
    hooks: {
      'astro:config:setup': ({ command, injectRoute, updateConfig }) => {
        if (command !== 'dev') return;
        injectRoute({
          pattern: '/__dev/blog-preview/',
          entrypoint: fileURLToPath(
            new URL('./preview.astro', import.meta.url),
          ),
          prerender: false,
        });
        // The POST originates at the separate loopback Admin port. The preview
        // handler applies its own exact origin/method/host/size checks instead.
        updateConfig({
          security: { checkOrigin: false },
          vite: { server: { strictPort: true } },
        });
      },
    },
  };
}
