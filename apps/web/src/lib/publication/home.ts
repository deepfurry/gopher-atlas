import { recent, type Publication } from './indexes';
export function homeContent(publication: Publication) {
  // Home is chronological; group and topic reading order stay untouched.
  return {
    notes: publication.snapshot.content
      .filter((item) => item.type === 'note')
      .sort(recent)
      .slice(0, 4),
    articles: publication.snapshot.content
      .filter((item) => item.type === 'curated_article')
      .sort(recent)
      .slice(0, 4),
    topics: (publication.contentByType.get('topic') ?? []).slice(0, 4),
  };
}
