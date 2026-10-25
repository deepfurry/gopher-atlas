import { useMemo } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import type { QueryKey, InfiniteData } from '@tanstack/react-query';
import { client, unwrap, type Schema } from './api';
import type { paths } from '@gopheratlas/api-client';

type ContentQuery = NonNullable<
  paths['/api/admin/v1/content']['get']['parameters']['query']
>;
// Content uses value-based cursors; other endpoints retain their numeric pages.
export function useContentPages(
  key: QueryKey,
  filters: ContentQuery,
  enabled = true,
) {
  return usePages<Schema<'ContentSummary'>, string>(
    key,
    async (cursor, signal) => {
      const page = unwrap(
        await client.GET('/api/admin/v1/content', {
          signal,
          params: { query: { ...filters, cursor: cursor || undefined } },
        }),
      );
      return { items: page.items, nextCursor: page.nextPageCursor ?? null };
    },
    enabled,
    '',
  );
}
export function usePages<T, Cursor extends number | string = number>(
  key: QueryKey,
  fetchPage: (
    after: Cursor,
    signal: AbortSignal,
  ) => Promise<{ items: T[]; nextCursor: Cursor | null }>,
  enabled = true,
  initialCursor: Cursor = 0 as Cursor,
) {
  type Page = { items: T[]; nextCursor: Cursor | null };
  const query = useInfiniteQuery<
    Page,
    Error,
    InfiniteData<Page>,
    QueryKey,
    Cursor
  >({
    queryKey: key,
    initialPageParam: initialCursor,
    // Both initial and next values originate from this hook's typed cursor contract.
    queryFn: ({ pageParam, signal }) => fetchPage(pageParam as Cursor, signal),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled,
    retry: false,
  });
  const items = useMemo(
    () => query.data?.pages.flatMap((page) => page.items) ?? [],
    [query.data],
  );
  return { ...query, items };
}
export function useEditorialRefresh() {
  const cache = useQueryClient();
  return async () => {
    await Promise.all(
      ['content', 'revisions', 'reviews', 'audit', 'publication'].map((key) =>
        cache.invalidateQueries({ queryKey: [key] }),
      ),
    );
  };
}
