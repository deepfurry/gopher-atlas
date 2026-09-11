import { Button } from '@/components/ui/button';
export function LoadMore({
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
}: {
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => Promise<unknown>;
}) {
  return hasNextPage ? (
    <Button
      variant="outline"
      disabled={isFetchingNextPage}
      onClick={() => void fetchNextPage()}
    >
      {isFetchingNextPage ? 'Loading…' : 'Load more'}
    </Button>
  ) : null;
}
