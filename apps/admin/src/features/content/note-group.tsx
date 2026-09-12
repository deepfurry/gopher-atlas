import { useFormContext, useWatch } from 'react-hook-form';
import { client, unwrap, ErrorNotice, type Schema } from '@/shared/api';
import { usePages } from '@/shared/query';
import { LoadMore } from '@/shared/pagination';
import { Input, Textarea } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import type { FormValues } from './form';

export function inferGroups(
  rows: Schema<'ContentSummary'>[],
  excludeId: number,
) {
  const groups = new Map<
    string,
    {
      group: string;
      groupSlug: string;
      groupDescription: string;
      groupOrder: number;
      conflict: boolean;
    }
  >();
  for (const row of rows) {
    if (row.id === excludeId || row.type !== 'note' || !row.product) continue;
    const p = row.product.payload;
    if (!('groupSlug' in p) || !p.groupSlug || !p.group) continue;
    const group = {
      group: p.group,
      groupSlug: p.groupSlug,
      groupDescription: p.groupDescription ?? '',
      groupOrder: p.groupOrder ?? 0,
      conflict: false,
    };
    const old = groups.get(group.groupSlug);
    if (
      old &&
      (old.group !== group.group ||
        old.groupDescription !== group.groupDescription ||
        old.groupOrder !== group.groupOrder)
    )
      old.conflict = true;
    else if (!old) groups.set(group.groupSlug, group);
  }
  return [...groups.values()].sort(
    (a, b) =>
      a.groupOrder - b.groupOrder || a.groupSlug.localeCompare(b.groupSlug),
  );
}

export function NoteGroupFields({ id }: { id: number }) {
  const { control, register, setValue } = useFormContext<FormValues>();
  const slug = useWatch({ control, name: 'payload.groupSlug' }) ?? '';
  const name = useWatch({ control, name: 'payload.group' }) ?? '';
  const notes = usePages(['content', 'note-groups'], async (after, signal) =>
    unwrap(
      await client.GET('/api/admin/v1/content', {
        signal,
        params: { query: { after, type: 'note' } },
      }),
    ),
  );
  const groups = inferGroups(notes.items, id),
    current = groups.find((group) => group.groupSlug === slug);
  const select = (value: string) => {
    setValue('payload.groupSlug', value, { shouldDirty: true });
    const group = groups.find((g) => g.groupSlug === value);
    if (group && !group.conflict) {
      setValue('payload.group', group.group, { shouldDirty: true });
      setValue('payload.groupDescription', group.groupDescription, {
        shouldDirty: true,
      });
      setValue('payload.groupOrder', group.groupOrder, { shouldDirty: true });
    }
  };
  return (
    <>
      <Select
        label="选择已有分组"
        value={slug}
        onValueChange={select}
        options={[
          { value: '', label: '创建新分组' },
          ...(!current && slug
            ? [{ value: slug, label: `${name || slug}（当前填写）` }]
            : []),
          ...groups.map((g) => ({
            value: g.groupSlug,
            label: `${g.group}${g.conflict ? ' · 元数据冲突' : ''}`,
            disabled: g.conflict,
          })),
        ]}
      />
      <label>
        分组路径标识
        <Input
          value={slug}
          onChange={(e) => select(e.target.value)}
          maxLength={100}
          placeholder="例如 cybersecurity"
        />
      </label>
      <label>
        分组名称
        <Input
          {...register('payload.group')}
          readOnly={!!current}
          maxLength={100}
        />
      </label>
      <label>
        分组说明
        <Textarea
          {...register('payload.groupDescription')}
          readOnly={!!current}
          maxLength={1000}
          rows={3}
        />
      </label>
      <label>
        分组排序
        <Input
          type="number"
          min={0}
          max={1000000}
          {...register('payload.groupOrder', { valueAsNumber: true })}
          readOnly={!!current}
        />
      </label>
      {current && (
        <p className="caption">
          沿用分组的统一名称、说明与顺序。新分组可在首篇随笔中设置。
        </p>
      )}
      {current?.conflict && (
        <p role="alert" className="error-message">
          已有随笔的分组信息不一致，请先统一后再发布。
        </p>
      )}
      <ErrorNotice error={notes.error} />
      <LoadMore {...notes} />
      {notes.hasNextPage && (
        <p className="caption">分组来自已加载的可访问随笔，可继续加载更多。</p>
      )}
    </>
  );
}
