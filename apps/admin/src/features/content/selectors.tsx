import { useState } from 'react';
import { client, unwrap, ErrorNotice, type Schema } from '@/shared/api';
import { usePages } from '@/shared/query';
import { LoadMore } from '@/shared/pagination';
import { useDebounced } from '@/shared/markdown';
import { name } from '@/shared/status';
import { Button } from '@/components/ui/button';
export function AuthorSelect({
  value,
  onChange,
  label = 'Byline',
  selected,
}: {
  value: number;
  onChange: (id: number) => void;
  label?: string;
  selected?: Schema<'AuthorSummary'>;
}) {
  const [search, setSearch] = useState('');
  const q = useDebounced(search);
  const authors = usePages(['authors', q], async (after, signal) =>
    unwrap(
      await client.GET('/api/admin/v1/authors', {
        signal,
        params: { query: { after, q } },
      }),
    ),
  );
  return (
    <div className="selector">
      <label>
        {label} search
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          maxLength={200}
        />
      </label>
      <label>
        {label}
        <select
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
        >
          {!authors.items.some((a) => a.userId === value) && (
            <option value={value}>
              {selected?.userId === value
                ? name(selected)
                : `Selected author #${value}`}
            </option>
          )}
          {authors.items.map((author) => (
            <option key={author.userId} value={author.userId}>
              {name(author)} · {author.slug}
            </option>
          ))}
        </select>
      </label>
      <ErrorNotice error={authors.error} />
      <LoadMore {...authors} />
    </div>
  );
}
export function TagSelect({
  value,
  onChange,
  selected = [],
}: {
  value: number[];
  onChange: (ids: number[]) => void;
  selected?: Schema<'Tag'>[];
}) {
  const [q, setQ] = useState('');
  const tags = usePages(['tags'], async (after, signal) =>
    unwrap(
      await client.GET('/api/admin/v1/tags', {
        signal,
        params: { query: { after } },
      }),
    ),
  );
  const merged = [
    ...new Map(
      [...selected, ...tags.items].map((tag) => [tag.id, tag]),
    ).values(),
  ];
  return (
    <fieldset className="selector">
      <legend>Tags</legend>
      <label>
        Search loaded tags
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      <div className="selection-list">
        {merged
          .filter((tag) =>
            `${tag.name} ${tag.slug}`.toLowerCase().includes(q.toLowerCase()),
          )
          .map((tag) => (
            <label className="check-label" key={tag.id}>
              <input
                type="checkbox"
                checked={value.includes(tag.id)}
                disabled={!value.includes(tag.id) && value.length >= 100}
                onChange={(e) =>
                  onChange(
                    e.target.checked
                      ? [...value, tag.id]
                      : value.filter((id) => id !== tag.id),
                  )
                }
              />
              {tag.name}
            </label>
          ))}
      </div>
      <ErrorNotice error={tags.error} />
      <LoadMore {...tags} />
      {tags.hasNextPage && (
        <p className="caption">Load more to search the next tags.</p>
      )}
    </fieldset>
  );
}
export function TopicEntries({
  id,
  value,
  onChange,
  initial = [],
}: {
  id: number;
  value: Schema<'TopicEntry'>[];
  onChange: (entries: Schema<'TopicEntry'>[]) => void;
  initial?: Schema<'TopicTargetSummary'>[];
}) {
  const [search, setSearch] = useState('');
  const q = useDebounced(search);
  const [choice, setChoice] = useState('');
  const targets = usePages(['content', 'targets', q], async (after, signal) =>
    unwrap(
      await client.GET('/api/admin/v1/content', {
        signal,
        params: { query: { after, q } },
      }),
    ),
  );
  const known = new Map<
    number,
    { title: string; published: boolean; archived: boolean }
  >(initial.map((t) => [t.id, t]));
  for (const t of targets.items)
    known.set(t.id, {
      title: t.title,
      published: t.publishedRevisionId !== null,
      archived: t.archivedAt !== null,
    });
  const move = (index: number, direction: number) => {
    const next = [...value];
    [next[index], next[index + direction]] = [
      next[index + direction]!,
      next[index]!,
    ];
    onChange(next);
  };
  return (
    <fieldset className="selector">
      <legend>Ordered content entries</legend>
      <ol className="topic-entries">
        {value.map((entry, index) => {
          const target = known.get(entry.targetContentId);
          return (
            <li key={entry.targetContentId}>
              <strong>
                {target?.title || `Content #${entry.targetContentId}`}
              </strong>
              {(!target?.published || target.archived) && (
                <p className="caption">
                  Unpublished — Topic cannot be published yet
                </p>
              )}
              <div className="toolbar">
                <Button
                  variant="outline"
                  aria-label={`Move entry ${index + 1} up`}
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  ↑
                </Button>
                <Button
                  variant="outline"
                  aria-label={`Move entry ${index + 1} down`}
                  disabled={index === value.length - 1}
                  onClick={() => move(index, 1)}
                >
                  ↓
                </Button>
                <Button
                  variant="outline"
                  onClick={() => onChange(value.filter((_, i) => i !== index))}
                >
                  Remove
                </Button>
              </div>
            </li>
          );
        })}
      </ol>
      <label>
        Find content
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          maxLength={200}
        />
      </label>
      <label>
        Add entry
        <select value={choice} onChange={(e) => setChoice(e.target.value)}>
          <option value="">Choose content</option>
          {targets.items
            .filter(
              (t) =>
                t.id !== id && !value.some((e) => e.targetContentId === t.id),
            )
            .map((t) => (
              <option key={t.id} value={t.id}>
                {t.title || 'Untitled'}
                {!t.publishedRevisionId ? ' · Unpublished' : ''}
              </option>
            ))}
        </select>
      </label>
      <Button
        variant="outline"
        disabled={!choice || value.length >= 100}
        onClick={() => {
          const target = Number(choice);
          if (
            target !== id &&
            !value.some((e) => e.targetContentId === target)
          ) {
            onChange([...value, { targetContentId: target }]);
            setChoice('');
          }
        }}
      >
        Add entry
      </Button>
      <ErrorNotice error={targets.error} />
      <LoadMore {...targets} />
    </fieldset>
  );
}
