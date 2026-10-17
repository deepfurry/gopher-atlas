import { useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { client, unwrap, ErrorNotice } from '@/shared/api';
import { usePages } from '@/shared/query';
import { LoadMore } from '@/shared/pagination';
import { useDebounced } from '@/hooks/use-debounced';
import { SearchSelect } from '@/components/ui/search-select';
import type { FormValues } from './form';

export function NoteGroupFields({ publishedPath }: { publishedPath?: string }) {
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
  const publishedGroup = publishedPath?.split('/')[2];
  return (
    <>
      {publishedPath !== undefined && (
        <p className="caption" role="note">
          更换已发布随笔的分组后，旧路径仍保留重定向，但 Giscus
          评论标识会改变，旧评论不会自动搬迁。
          {publishedGroup &&
            slug !== publishedGroup &&
            ' 当前选择与已发布分组不同。'}
        </p>
      )}
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
            setValue('payload.group', group?.name ?? '', { shouldDirty: true });
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
      <p className="caption">
        分组名称、说明与展示顺序由管理员在「随笔分组」页面统一维护。
      </p>
    </>
  );
}
