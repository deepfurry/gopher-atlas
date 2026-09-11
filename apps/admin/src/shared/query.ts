import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import type { QueryKey } from '@tanstack/react-query';
export function usePages<T>(
  key: QueryKey,
  fetchPage: (
    after: number,
    signal: AbortSignal,
  ) => Promise<{ items: T[]; nextCursor: number | null }>,
  enabled = true,
) {
  const query = useInfiniteQuery({
    queryKey: key,
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) => fetchPage(pageParam, signal),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled,
    retry: false,
  });
  return {
    ...query,
    items: query.data?.pages.flatMap((page) => page.items) ?? [],
  };
}
export function useEditorialRefresh() {
  const cache = useQueryClient();
  return async () => {
    await Promise.all(
      ['content', 'revisions', 'reviews', 'audit'].map((key) =>
        cache.invalidateQueries({ queryKey: [key] }),
      ),
    );
  };
}
