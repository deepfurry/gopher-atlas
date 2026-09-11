// Public-only view of content-snapshot.schema.json v1, never an Admin DTO.
// snapshot.ts validates the closed schema before admitting these values.
export interface Author {
  id: number;
  slug: string;
  displayName: string;
  bioMarkdown: string;
  avatarUrl: string;
  websiteUrl: string;
}
export interface Asset {
  id: number;
  url: string;
  mimeType: string;
  width: number;
  height: number;
  byteSize: number;
}
export interface Tag {
  id: number;
  name: string;
  slug: string;
  description: string;
}
export interface NotePayload {
  group: string;
  groupSlug: string;
  order: number;
}
export interface CuratedPayload {
  sourceUrl: string;
  originalUrl: string;
  sourceAuthor: string;
  sourceName: string;
  sourcePublishedAt: string;
  sourceLanguage: string;
  difficulty: string;
  rating: string;
  mustRead: boolean;
  relatedLinks: { label: string; url: string }[];
}
interface ContentFields {
  id: number;
  revisionNo: number;
  canonicalPath: string;
  title: string;
  slug: string;
  summary: string;
  bodyMarkdown: string;
  authorId: number;
  language: string;
  featured: boolean;
  seoTitle: string;
  seoDescription: string;
  coverAssetId: number | null;
  firstPublishedAt: number;
  lastPublishedAt: number;
  tagIds: number[];
  topicEntries: { position: number; targetContentId: number }[];
}
export type Content = ContentFields &
  (
    | { type: 'post'; payload: Record<string, never> }
    | { type: 'note'; payload: NotePayload }
    | { type: 'topic'; payload: { order: number } }
    | { type: 'curated_article'; payload: CuratedPayload }
  );
export type ContentType = Content['type'];
export interface Snapshot {
  schemaVersion: 1;
  generation: number;
  exportedAt: string;
  authors: Author[];
  assets: Asset[];
  tags: Tag[];
  content: Content[];
  routes: { path: string; kind: 'canonical' | 'redirect'; contentId: number }[];
}
