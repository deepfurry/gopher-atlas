import { developmentAssetPolicy } from '@gopheratlas/markdown';

// Only the astro:config:setup dev hook defines this non-secret value. Builds
// cannot opt into local image policy through root .env or process credentials.
export const assetPolicy =
  import.meta.env?.DEV && import.meta.env?.GOPHERATLAS_LOCAL_ASSETS
    ? developmentAssetPolicy(import.meta.env.GOPHERATLAS_LOCAL_ASSETS)
    : undefined;
