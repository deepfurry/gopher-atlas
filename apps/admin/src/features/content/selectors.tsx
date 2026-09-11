import { useState } from 'react';
import { ArrowUp, ArrowDown, X, Plus } from '@phosphor-icons/react';
import { client, unwrap, ErrorNotice, type Schema } from '@/shared/api';
import { usePages } from '@/shared/query';
import { LoadMore } from '@/shared/pagination';
import { useDebounced } from '@/hooks/use-debounced';
import { name } from '@/shared/status';
import { Button, IconButton } from '@/components/ui/button';
import { SearchInput } from '@/components/ui/input';
import { SearchSelect } from '@/components/ui/search-select';
import { Checkbox } from '@/components/ui/checkbox';
export function AuthorSelect({
  value,
  onChange,
  label = '署名作者',
  selected,
  allowAll = false,
}: {
  value: number;
  onChange: (id: number) => void;
  label?: string;
  selected?: Schema<'AuthorSummary'>;
  allowAll?: boolean;
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
  const options = authors.items.map((a) => ({
    value: String(a.userId),
    label: name(a),
  }));
  if (allowAll) options.unshift({ value: '0', label: '全部负责人' });
  if (value && !authors.items.some((a) => a.userId === value))
    options.unshift({
      value: String(value),
      label: selected?.userId === value ? name(selected) : `已选作者 #${value}`,
    });
  return (
    <div className="author-selector">
      <SearchSelect
        label={label}
        value={String(value)}
        onValueChange={(next) => onChange(Number(next))}
        options={options}
        search={search}
        onSearchChange={setSearch}
        footer={
          <>
            <ErrorNotice error={authors.error} />
            <LoadMore {...authors} />
          </>
        }
      />
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
  const visible = merged.filter((tag) =>
    `${tag.name} ${tag.slug}`.toLowerCase().includes(q.toLowerCase()),
  );
  return (
    <fieldset className="selector">
      <legend>
        标签{' '}
        <span className="caption">
          {value.length ? `已选 ${value.length}` : ''}
        </span>
      </legend>
      <SearchInput
        aria-label="搜索已加载标签"
        placeholder="搜索已加载标签…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="selection-list">
        {visible.map((tag) => (
          <Checkbox
            key={tag.id}
            label={tag.name}
            checked={value.includes(tag.id)}
            disabled={!value.includes(tag.id) && value.length >= 100}
            onCheckedChange={(checked) =>
              onChange(
                checked
                  ? [...value, tag.id]
                  : value.filter((id) => id !== tag.id),
              )
            }
          />
        ))}
        {!visible.length && <p className="caption">没有匹配的标签</p>}
      </div>
      <ErrorNotice error={tags.error} />
      <LoadMore {...tags} />
      {tags.hasNextPage && (
        <p className="caption">搜索范围为已加载标签，可继续加载更多。</p>
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
  const [search, setSearch] = useState(''),
    [choice, setChoice] = useState('');
  const q = useDebounced(search);
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
  const options = targets.items
    .filter(
      (t) => t.id !== id && !value.some((e) => e.targetContentId === t.id),
    )
    .map((t) => ({
      value: String(t.id),
      label: `${t.title || '未命名内容'}${!t.publishedRevisionId ? ' · 未发布' : ''}`,
    }));
  return (
    <fieldset className="selector">
      <legend>专题条目</legend>
      <ol className="topic-entries">
        {value.map((entry, index) => {
          const target = known.get(entry.targetContentId);
          return (
            <li key={entry.targetContentId}>
              <div className="topic-entry-heading">
                <span className="entry-number">{index + 1}</span>
                <strong>
                  {target?.title || `内容 #${entry.targetContentId}`}
                </strong>
              </div>
              {(!target?.published || target.archived) && (
                <p className="caption">条目未发布，专题暂时无法发布</p>
              )}
              <div className="toolbar">
                <IconButton
                  label={`上移条目 ${index + 1}`}
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  <ArrowUp />
                </IconButton>
                <IconButton
                  label={`下移条目 ${index + 1}`}
                  disabled={index === value.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <ArrowDown />
                </IconButton>
                <IconButton
                  label={`移除条目 ${index + 1}`}
                  onClick={() => onChange(value.filter((_, i) => i !== index))}
                >
                  <X />
                </IconButton>
              </div>
            </li>
          );
        })}
      </ol>
      <SearchSelect
        label="添加条目"
        value={choice}
        onValueChange={setChoice}
        options={options}
        search={search}
        onSearchChange={setSearch}
        footer={<LoadMore {...targets} />}
      />
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
        <Plus />
        添加条目
      </Button>
      <ErrorNotice error={targets.error} />
    </fieldset>
  );
}
