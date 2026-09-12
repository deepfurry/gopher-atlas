import { useState } from 'react';
import {
  ArrowUp,
  ArrowDown,
  X,
  Plus,
  DotsSixVertical,
  Star,
} from '@phosphor-icons/react';
import { reorderTopic } from './topic-order';
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
  recommendedCount = 0,
  onRecommendedCountChange = () => {},
}: {
  id: number;
  value: Schema<'TopicEntry'>[];
  onChange: (entries: Schema<'TopicEntry'>[]) => void;
  initial?: Schema<'TopicTargetSummary'>[];
  recommendedCount?: number;
  onRecommendedCountChange?: (count: number) => void;
}) {
  const [search, setSearch] = useState(''),
    [choice, setChoice] = useState('');
  const [dragging, setDragging] = useState<number | null>(null);
  const q = useDebounced(search);
  const targets = usePages(['content', 'targets', q], async (after, signal) =>
    unwrap(
      await client.GET('/api/admin/v1/content', {
        signal,
        params: { query: { after, q, type: 'curated_article' } },
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
  const moveTo = (from: number, to: number, recommended: boolean) => {
    const next = reorderTopic(value, recommendedCount, from, to, recommended);
    onRecommendedCountChange(next.recommendedCount);
    onChange(next.entries);
  };
  const options = targets.items
    .filter(
      (t) =>
        t.type === 'curated_article' &&
        t.id !== id &&
        !value.some((e) => e.targetContentId === t.id),
    )
    .map((t) => ({
      value: String(t.id),
      label: `${t.title || '未命名内容'}${!t.publishedRevisionId ? ' · 未发布' : ''}`,
    }));
  return (
    <fieldset className="selector">
      <legend>精选文章编排</legend>
      {[true, false].map((recommended) => (
        <section
          key={String(recommended)}
          className="topic-section"
          aria-label={recommended ? '推荐阅读' : '专区文章'}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (dragging !== null)
              moveTo(
                dragging,
                recommended ? recommendedCount : value.length,
                recommended,
              );
            setDragging(null);
          }}
        >
          <h3>
            {recommended ? '推荐阅读' : '专区文章'}{' '}
            <span className="caption">
              {recommended ? recommendedCount : value.length - recommendedCount}
            </span>
          </h3>
          <ol
            className="topic-entries"
            start={recommended ? 1 : recommendedCount + 1}
          >
            {value.map((entry, index) => {
              if (index < recommendedCount !== recommended) return null;
              const target = known.get(entry.targetContentId);
              return (
                <li
                  key={entry.targetContentId}
                  draggable
                  onDragStart={() => setDragging(index)}
                  onDragEnd={() => setDragging(null)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (dragging !== null) moveTo(dragging, index, recommended);
                    setDragging(null);
                  }}
                >
                  <div className="topic-entry-heading">
                    <span className="entry-number">{index + 1}</span>
                    <DotsSixVertical aria-hidden="true" />
                    <strong>
                      {target?.title || `内容 #${entry.targetContentId}`}
                    </strong>
                  </div>
                  {(!target?.published || target.archived) && (
                    <p className="caption">精选文章未发布，专区暂时无法发布</p>
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
                      onClick={() => {
                        onRecommendedCountChange(
                          recommendedCount - Number(index < recommendedCount),
                        );
                        onChange(value.filter((_, i) => i !== index));
                      }}
                    >
                      <X />
                    </IconButton>
                    <Button
                      variant="ghost"
                      onClick={() =>
                        moveTo(index, recommendedCount, !recommended)
                      }
                    >
                      <Star />
                      {recommended ? '移出推荐' : '设为推荐'}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ol>
          {!value.some(
            (_, index) => index < recommendedCount === recommended,
          ) && (
            <p className="caption">
              {recommended
                ? '将重点文章移入推荐阅读。'
                : '搜索并添加精选文章，或拖动调整编排。'}
            </p>
          )}
        </section>
      ))}
      <SearchSelect
        label="搜索精选文章"
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
            targets.items.some(
              (item) => item.id === target && item.type === 'curated_article',
            ) &&
            target !== id &&
            !value.some((e) => e.targetContentId === target)
          ) {
            onChange([...value, { targetContentId: target }]);
            setChoice('');
          }
        }}
      >
        <Plus />
        添加精选文章
      </Button>
      <ErrorNotice error={targets.error} />
    </fieldset>
  );
}
