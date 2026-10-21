import type {
  Content,
  ContentV1,
  NormalizedSnapshot,
  NoteGroup,
  Snapshot,
  TagV1,
} from './types.ts';

export const adaptTagV1 = (tag: TagV1) => ({
  ...tag,
  nameEn: '',
  descriptionEn: '',
});
export const adaptContentV1 = (item: ContentV1): Content =>
  item.type === 'note'
    ? {
        ...item,
        payload: {
          groupSlug: item.payload.groupSlug,
          order: item.payload.order,
        },
      }
    : item;

/** Only called after wire validation. No mutation of input or its byte/hash identity. */
export function normalizeSnapshot(snapshot: Snapshot): NormalizedSnapshot {
  if (snapshot.schemaVersion === 2 || snapshot.schemaVersion === 3)
    return snapshot;
  if (snapshot.schemaVersion !== 1) throw new Error('public_snapshot_version');
  const groups = new Map<string, NoteGroup>();
  for (const item of snapshot.content) {
    if (item.type !== 'note') continue;
    const p = item.payload;
    const prior = groups.get(p.groupSlug);
    if (
      prior &&
      (prior.name !== p.group ||
        prior.description !== p.groupDescription ||
        prior.order !== p.groupOrder)
    )
      throw new Error('public_note_group_conflict');
    groups.set(p.groupSlug, {
      id: null,
      slug: p.groupSlug,
      name: p.group,
      description: p.groupDescription,
      nameEn: '',
      descriptionEn: '',
      order: p.groupOrder,
    });
  }
  return {
    ...snapshot,
    tags: snapshot.tags.map(adaptTagV1),
    groups: [...groups.values()],
    content: snapshot.content.map(adaptContentV1),
  };
}
