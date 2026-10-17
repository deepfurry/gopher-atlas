import { useState, type ReactNode } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { client, unwrap, ErrorNotice } from '@/shared/api';
import { usePages } from '@/shared/query';
import { LoadMore } from '@/shared/pagination';
import { useDebounced } from '@/hooks/use-debounced';
import { SearchSelect } from '@/components/ui/search-select';
import type { FormValues } from './form';

export function NoteGroupFields({
  publishedPath,
  children,
}: {
  publishedPath?: string;
  children: ReactNode;
}) {
  const { control, setValue } = useFormContext<FormValues>();
  const slug = useWatch({ control, name: 'payload.groupSlug' }) ?? '';
  const name = useWatch({ control, name: 'payload.group' }) ?? '';
  const [search, setSearch] = useState('');
  const q = useDebounced(search);
  const groups = usePages(['note-groups', q], async (after, signal) =>
    unwrap(
      await client.GET('/api/admin/v1/note-groups', {
        signal,
        params: { query: { after, q } },
      }),
    ),
  );
  const options = groups.items.map((group) => ({
    value: group.slug,
    label: group.name,
  }));
  if (slug && !options.some((option) => option.value === slug))
    options.unshift({ value: slug, label: `${name || slug}（当前分组）` });
  options.unshift({ value: '', label: '暂不分组（发布前必选）' });
  // Only the complete published canonical identifies the original group; Draft
  // mirrors and malformed/missing routes must never trigger a migration warning.
  const published = publishedPath?.match(
    /^\/notes\/([a-z0-9]+(?:-[a-z0-9]+)*)\/([a-z0-9]+(?:-[a-z0-9]+)*)\/$/,
  );
  const changedPublishedGroup =
    published &&
    published[1].length <= 100 &&
    published[2].length <= 100 &&
    slug.length <= 100 &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) &&
    slug !== published[1];
  return (
    <div className="inspector-grid">
      <label>
        随笔分组
        <SearchSelect
          label="选择已有分组"
          value={slug}
          options={options}
          search={search}
          onSearchChange={setSearch}
          onValueChange={(value) => {
            // Go resolves the selected slug again at the write gate. These mirrors
            // are presentation only, including if metadata changed during editing.
            const group = groups.items.find((item) => item.slug === value);
            setValue('payload.groupSlug', value, { shouldDirty: true });
            if (group || !value) {
              setValue('payload.group', group?.name ?? '', {
                shouldDirty: true,
              });
              setValue('payload.groupDescription', group?.description ?? '', {
                shouldDirty: true,
              });
              setValue('payload.groupOrder', group?.order ?? 0, {
                shouldDirty: true,
              });
            }
          }}
          footer={
            <>
              <ErrorNotice error={groups.error} />
              <LoadMore {...groups} />
            </>
          }
        />
      </label>
      {children}
      {changedPublishedGroup && (
        <p className="caption inspector-full" role="note">
          更换已发布随笔的分组后，旧路径仍保留重定向，但 Giscus
          评论标识会改变，旧评论不会自动搬迁。
        </p>
      )}
    </div>
  );
}
