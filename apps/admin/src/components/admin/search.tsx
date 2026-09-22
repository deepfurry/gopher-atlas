import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { MagnifyingGlass, ArrowUpRight } from '@phosphor-icons/react';
import { useMe } from '@/app/context';
import { client, unwrap, ErrorNotice } from '@/shared/api';
import { useDebounced } from '@/hooks/use-debounced';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { SearchInput } from '@/components/ui/input';
import { LoadingState, EmptyState } from '@/components/ui/workspace';
import { visibleNavigation } from './navigation';
export function GlobalSearch() {
  const me = useMe();
  const [open, setOpen] = useState(false),
    [search, setSearch] = useState('');
  const q = useDebounced(search.trim());
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  const result = useQuery({
    queryKey: ['content', 'search', q],
    enabled: open && q.length > 0,
    queryFn: async ({ signal }) =>
      unwrap(
        await client.GET('/api/admin/v1/content', {
          signal,
          params: { query: { q } },
        }),
      ),
  });
  const links = visibleNavigation(me.permissions)
    .flatMap((group) => group.items)
    .filter((item) => !item.external && item.label.includes(search.trim()));
  return (
    <>
      <Button
        variant="ghost"
        className="global-search-trigger"
        onClick={() => setOpen(true)}
        aria-label="搜索内容与页面"
      >
        <MagnifyingGlass />
        <span>搜索内容与页面</span>
        <kbd>⌘ K</kbd>
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="搜索"
        description="搜索可访问内容的标题、摘要，或快速跳转页面。"
      >
        <SearchInput
          aria-label="搜索内容与页面"
          value={search}
          maxLength={200}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
        />
        <div className="search-results">
          {links.length > 0 && <p className="caption">页面</p>}
          {links.map((item) => (
            <Link key={item.to} to={item.to} onClick={() => setOpen(false)}>
              <item.icon />
              {item.label}
              <ArrowUpRight />
            </Link>
          ))}
          {q && (
            <>
              <p className="caption">内容 · 最多显示 10 条</p>
              <ErrorNotice error={result.error} />
              {result.isFetching ? (
                <LoadingState label="正在搜索…" />
              ) : (
                result.data?.items.slice(0, 10).map((item) => (
                  <Link
                    key={item.id}
                    to={`/content/${item.id}`}
                    onClick={() => setOpen(false)}
                  >
                    {item.title || '未命名内容'}
                    <ArrowUpRight />
                  </Link>
                ))
              )}
              {result.data && !result.data.items.length && (
                <EmptyState title="没有匹配的内容" />
              )}
              {result.data &&
                (result.data.nextCursor !== null ||
                  result.data.items.length > 10) && (
                  <Link
                    to={`/content?q=${encodeURIComponent(q)}`}
                    onClick={() => setOpen(false)}
                  >
                    查看全部搜索结果
                    <ArrowUpRight />
                  </Link>
                )}
            </>
          )}
        </div>
      </Dialog>
    </>
  );
}
