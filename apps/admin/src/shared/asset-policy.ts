import {
  developmentAssetPolicy,
  isControlledImage as image,
  validateMarkdown as validate,
} from '@gopheratlas/markdown';

declare const __GOPHERATLAS_ASSET_BASE__: string;
const policy =
  import.meta.env.DEV && typeof __GOPHERATLAS_ASSET_BASE__ === 'string'
    ? developmentAssetPolicy(__GOPHERATLAS_ASSET_BASE__)
    : undefined;
export const isControlledImage = (url: string) => image(url, policy);
export const validateMarkdown = (source: string) => validate(source, policy);
