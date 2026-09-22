import type { Schema } from '@/shared/api';
/** One list + one boundary, including drag crossing between the two sections. */
export function reorderTopic(
  entries: Schema<'TopicEntry'>[],
  recommendedCount: number,
  from: number,
  to: number,
  recommended: boolean,
) {
  if (from < 0 || from >= entries.length) return { entries, recommendedCount };
  const next = [...entries],
    [item] = next.splice(from, 1);
  let count = recommendedCount - Number(from < recommendedCount);
  const index = recommended
    ? Math.min(Math.max(0, to), count)
    : Math.max(count, Math.min(to, next.length));
  next.splice(index, 0, item!);
  count += Number(recommended);
  return { entries: next, recommendedCount: count };
}
