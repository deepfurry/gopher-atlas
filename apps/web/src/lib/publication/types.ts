// Public wire contracts and the normalized reader model, never Admin DTOs.
// snapshot.ts validates the selected closed schema before admitting values.
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
export interface TagV1 {
  id: number;
  name: string;
  slug: string;
  description: string;
}
export interface LocalizedTaxonomy {
  name: string;
  description: string;
  nameEn: string;
  descriptionEn: string;
}
export interface Tag extends TagV1, LocalizedTaxonomy {}
export interface NoteGroup extends LocalizedTaxonomy {
  // v1 has no group identity. Do not invent a CMS ID in its adapter.
  id: number | null;
  slug: string;
  order: number;
}
export interface NotePayload {
  groupSlug: string;
  order: number;
}
export interface NotePayloadV1 extends NotePayload {
  group: string;
  groupDescription: string;
  groupOrder: number;
}
export interface CuratedPayload {
  sourceUrl: string;
  originalUrl: string;
  sourceAuthor: string;
  sourceName: string;
  sourcePublishedAt: string;
  sourceLanguage: string;
  difficulty: '' | 'beginner' | 'intermediate' | 'advanced';
  rating: '' | 'S+' | 'S' | 'A+' | 'A' | 'B+' | 'B' | 'C+' | 'C';
  mustRead: boolean;
  relatedLinks: { label: string; url: string }[];
}
export interface EditorialEnglish {
  enabled: true;
  title: string;
  summary: string;
  bodyMarkdown: string;
  seoTitle: string;
  seoDescription: string;
  labels: {
    sourceAuthor: string;
    sourceName: string;
    relatedLinks: { label: string; url: string }[];
  };
}
interface ContentFields {
  editorialEn?: EditorialEnglish | null;
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
    | { type: 'topic'; payload: { order: number; recommendedCount: number } }
    | { type: 'curated_article'; payload: CuratedPayload }
  );
export type ContentType = Content['type'];
export type ContentV1 =
  | Exclude<Content, { type: 'note' }>
  | (ContentFields & { type: 'note'; payload: NotePayloadV1 });
interface SnapshotFields {
  generation: number;
  exportedAt: string;
  authors: Author[];
  assets: Asset[];
  routes: { path: string; kind: 'canonical' | 'redirect'; contentId: number }[];
}
export interface SnapshotV1 extends SnapshotFields {
  schemaVersion: 1;
  tags: TagV1[];
  content: ContentV1[];
}
export interface SnapshotV2 extends SnapshotFields {
  schemaVersion: 2;
  tags: Tag[];
  groups: (NoteGroup & { id: number })[];
  content: Content[];
}
export interface SnapshotV3 extends Omit<SnapshotV2, 'schemaVersion'> {
  schemaVersion: 3;
}
export type Snapshot = SnapshotV1 | SnapshotV2 | SnapshotV3;
export interface NormalizedSnapshot extends SnapshotFields {
  schemaVersion: 1 | 2 | 3;
  tags: Tag[];
  groups: NoteGroup[];
  content: Content[];
}
