import { useState } from 'react';
import { Link } from 'react-router';
import { client, unwrap, ErrorNotice } from '@/shared/api';
import { usePages } from '@/shared/query';
import { useDebounced } from '@/shared/markdown';
import { LoadMore } from '@/shared/pagination';
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
      <p className="caption">PEOPLE · AUTHORSHIP</p>
      <h1>Authors</h1>
      <p className="caption">
        Author profiles describe attribution. Account access is managed
        separately in Users.
      </p>
      <label className="search-field">
        Search authors
        <input
          type="search"
          value={search}
          maxLength={200}
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>
      <ErrorNotice error={list.error} />
      <ul className="author-list">
        {list.items.map((author) => (
          <li key={author.userId}>
            <Link to={`/authors/${author.userId}`}>{author.displayName}</Link>
            <span className="caption">{author.slug}</span>
          </li>
        ))}
      </ul>
      <LoadMore {...list} />
    </>
  );
}
