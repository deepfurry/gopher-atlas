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
      {isFetchingNextPage ? '正在加载…' : '加载更多'}
    </Button>
  ) : null;
}
