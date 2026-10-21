import type { Content } from './types.ts';
import { localized, type Locale } from '../i18n.ts';

export const isEditorial = (item: Content) =>
  item.type === 'curated_article' || item.type === 'topic';
export const hasEnglish = (item: Content) =>
  isEditorial(item) && item.editorialEn?.enabled === true;
export function contentPath(item: Content, locale: Locale): string {
  return locale === 'en' && isEditorial(item) && !hasEnglish(item)
    ? item.canonicalPath
    : localized(item.canonicalPath, locale);
}
// A view only: identity, shared relations and original wire/hash remain untouched.
export function editorialView<T extends Content>(item: T, locale: Locale): T {
  if (locale !== 'en' || !hasEnglish(item)) return item;
  const e = item.editorialEn!;
  const view = {
    ...item,
    title: e.title,
    summary: e.summary,
    bodyMarkdown: e.bodyMarkdown,
    seoTitle: e.seoTitle,
    seoDescription: e.seoDescription,
    language: 'en',
  };
  if (view.type === 'curated_article')
    view.payload = {
      ...view.payload,
      sourceAuthor: e.labels.sourceAuthor.trim() || view.payload.sourceAuthor,
      sourceName: e.labels.sourceName.trim() || view.payload.sourceName,
      relatedLinks: view.payload.relatedLinks.map((link) => ({
        ...link,
        label:
          e.labels.relatedLinks
            .find((en) => en.url === link.url)
            ?.label.trim() || link.label,
      })),
    };
  return view;
}
