import type { Locale } from '../i18n.ts';
import type { LocalizedTaxonomy } from './types.ts';

// Each optional English field falls back independently; identities never vary.
export function taxonomyText(value: LocalizedTaxonomy, locale: Locale) {
  return {
    name: locale === 'en' && value.nameEn.trim() ? value.nameEn : value.name,
    description:
      locale === 'en' && value.descriptionEn.trim()
        ? value.descriptionEn
        : value.description,
  };
}
