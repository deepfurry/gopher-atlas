import { useState } from 'react';
import { Link } from 'react-router';
import { ArrowUpRight } from '@phosphor-icons/react';
import { client, unwrap, ErrorNotice } from '@/shared/api';
import { usePages } from '@/shared/query';
import { useDebounced } from '@/hooks/use-debounced';
import { LoadMore } from '@/shared/pagination';
import {
  PageHeader,
  Avatar,
  EmptyState,
  LoadingState,
} from '@/components/ui/workspace';
import { SearchInput } from '@/components/ui/input';
export default function Authors() {
  const [search, setSearch] = useState('');
  const q = useDebounced(search);
  const list = usePages(['authors', q], async (after, signal) =>
    unwrap(
      await client.GET('/api/admin/v1/authors', {
        signal,
        params: { query: { after, q } },
      }),
    ),
  );
  return (
    <>
      <PageHeader
        title="作者管理"
        description="查看作者署名与公开资料。账户角色和访问权限请在用户管理中维护。"
      />
      <div className="filter-bar">
        <SearchInput
          aria-label="搜索作者"
          placeholder="搜索作者名称…"
          value={search}
          maxLength={200}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <ErrorNotice error={list.error} />
      {list.isPending ? (
        <LoadingState />
      ) : !list.items.length ? (
        <EmptyState title="没有匹配的作者" />
      ) : (
        <div className="author-directory">
          {list.items.map((author) => (
            <Link key={author.userId} to={`/authors/${author.userId}`}>
              <Avatar
                name={author.displayName}
                url={author.avatarUrl}
                size={40}
              />
              <div>
                <strong>{author.displayName}</strong>
                <span className="caption">{author.slug}</span>
              </div>
              <ArrowUpRight size={15} />
            </Link>
          ))}
        </div>
      )}
      <div className="pagination">
        <span>已加载 {list.items.length} 位作者</span>
        <LoadMore {...list} />
      </div>
    </>
  );
}
