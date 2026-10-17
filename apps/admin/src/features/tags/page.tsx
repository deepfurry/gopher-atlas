import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, PencilSimple, Tag as TagIcon } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { useMe } from '@/app/context';
import {
  client,
  unwrap,
  ErrorNotice,
  NoAccess,
  type Schema,
} from '@/shared/api';
import { useDebounced } from '@/hooks/use-debounced';
import { usePages } from '@/shared/query';
import { LoadMore } from '@/shared/pagination';
import { Button } from '@/components/ui/button';
import { Input, Textarea, SearchInput } from '@/components/ui/input';
import { Dialog } from '@/components/ui/dialog';
import {
  PageHeader,
  Table,
  LoadingState,
  EmptyState,
  FormField,
} from '@/components/ui/workspace';
z.config(z.locales.zhCN());
const schema = z.object({
  name: z.string().trim().min(1, '请输入名称').max(100),
  slug: z
    .string()
    .max(100)
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      '请使用小写字母或数字，并以短横线分隔。',
    ),
  description: z.string().max(1000),
  nameEn: z.string().trim().max(100),
  descriptionEn: z.string().max(1000),
  order: z.number().int().min(0).max(1000000),
});
type Taxonomy = Schema<'Tag'> | Schema<'NoteGroup'>;
function TagForm({
  tag,
  done,
  groups,
}: {
  tag?: Taxonomy;
  done: () => void;
  groups: boolean;
}) {
  const label = groups ? '随笔分组' : '标签';
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: tag
      ? {
          name: tag.name,
          slug: tag.slug,
          description: tag.description,
          nameEn: tag.nameEn,
          descriptionEn: tag.descriptionEn,
          order: 'order' in tag ? tag.order : 0,
        }
      : {
          name: '',
          slug: '',
          description: '',
          nameEn: '',
          descriptionEn: '',
          order: 0,
        },
  });
  const save = useMutation({
    mutationFn: async (values: z.infer<typeof schema>) => {
      if (groups)
        return tag
          ? unwrap(
              await client.PUT('/api/admin/v1/note-groups/{id}', {
                params: { path: { id: tag.id } },
                body: values,
              }),
            )
          : unwrap(
              await client.POST('/api/admin/v1/note-groups', { body: values }),
            );
      const { name, slug, description, nameEn, descriptionEn } = values;
      const body = { name, slug, description, nameEn, descriptionEn };
      return tag
        ? unwrap(
            await client.PUT('/api/admin/v1/tags/{id}', {
              params: { path: { id: tag.id } },
              body,
            }),
          )
        : unwrap(await client.POST('/api/admin/v1/tags', { body }));
    },
    onSuccess: () => {
      toast.success(`${label}已保存。`);
      done();
    },
  });
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && done()}
      title={`${tag ? '编辑' : '新建'}${label}`}
      busy={save.isPending}
      footer={
        <>
          <Button variant="outline" disabled={save.isPending} onClick={done}>
            取消
          </Button>
          <Button type="submit" form="tag-form" disabled={save.isPending}>
            {save.isPending ? '正在保存…' : `保存${label}`}
          </Button>
        </>
      }
    >
      <form
        id="tag-form"
        className="compact-form"
        onSubmit={form.handleSubmit((value) => {
          if (!groups && !value.nameEn && value.descriptionEn) {
            form.setError('nameEn', {
              message: '填写英文描述时，请同时填写英文名称；均留空则回退中文。',
            });
            return;
          }
          save.mutate(value);
        })}
      >
        <FormField
          label="名称"
          required
          error={form.formState.errors.name?.message}
        >
          {(props) => <Input {...props} {...form.register('name')} autoFocus />}
        </FormField>
        <FormField
          label="路径标识"
          required
          error={form.formState.errors.slug?.message}
          help="路径标识仅创建时设置，保存后不可更改。"
        >
          {(props) => (
            <Input {...props} {...form.register('slug')} readOnly={!!tag} />
          )}
        </FormField>
        <FormField
          label="描述"
          error={form.formState.errors.description?.message}
        >
          {(props) => (
            <Textarea {...props} rows={3} {...form.register('description')} />
          )}
        </FormField>
        <FormField
          label="英文名称（可选）"
          error={form.formState.errors.nameEn?.message}
          help="留空时公开站回退中文名称。"
        >
          {(props) => (
            <Input {...props} {...form.register('nameEn')} maxLength={100} />
          )}
        </FormField>
        <FormField
          label="英文描述（可选）"
          error={form.formState.errors.descriptionEn?.message}
          help="留空时公开站回退中文描述。"
        >
          {(props) => (
            <Textarea
              {...props}
              {...form.register('descriptionEn')}
              rows={3}
              maxLength={1000}
            />
          )}
        </FormField>
        {groups && (
          <FormField
            label="分组排序"
            error={form.formState.errors.order?.message}
            help="数值越小，公开站位置越靠前。"
          >
            {(props) => (
              <Input
                {...props}
                type="number"
                min={0}
                max={1000000}
                {...form.register('order', { valueAsNumber: true })}
              />
            )}
          </FormField>
        )}
        <ErrorNotice error={save.error} />
      </form>
    </Dialog>
  );
}
export function TaxonomyPage({ groups = false }: { groups?: boolean }) {
  const label = groups ? '随笔分组' : '标签';
  const key = groups ? 'note-groups' : 'tags';
  const me = useMe(),
    cache = useQueryClient();
  const [edit, setEdit] = useState<Taxonomy | 'new' | null>(null),
    [search, setSearch] = useState('');
  const q = useDebounced(search);
  const list = usePages<Taxonomy>(
    [key, q],
    async (after, signal) =>
      groups
        ? unwrap(
            await client.GET('/api/admin/v1/note-groups', {
              signal,
              params: { query: { after, q } },
            }),
          )
        : unwrap(
            await client.GET('/api/admin/v1/tags', {
              signal,
              params: { query: { after, q } },
            }),
          ),
    me.permissions.manageTaxonomy,
  );
  if (!me.permissions.manageTaxonomy) return <NoAccess />;
  const done = () => {
    setEdit(null);
    void cache.invalidateQueries({ queryKey: [key] });
    void cache.invalidateQueries({ queryKey: ['content'] });
    void cache.invalidateQueries({ queryKey: ['audit'] });
    void cache.invalidateQueries({ queryKey: ['publication'] });
  };
  const items = list.items;
  return (
    <>
      <PageHeader
        title={label}
        description="维护公开分类的中英文信息。路径标识永久保留；修改已发布内容使用的分类会触发站点更新。"
        actions={
          <Button onClick={() => setEdit('new')}>
            <Plus />
            新建{label}
          </Button>
        }
      />
      <div className="filter-bar">
        <SearchInput
          aria-label={`搜索${label}`}
          placeholder="搜索中文名、英文名或路径标识…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <ErrorNotice error={list.error} />
      {list.isPending ? (
        <LoadingState />
      ) : !items.length ? (
        <EmptyState
          title={`没有匹配的${label}`}
          description={`创建${label}后，可在内容编辑器中选择。`}
        />
      ) : (
        <Table label={`${label}列表`}>
          <thead>
            <tr>
              <th>名称</th>
              <th>路径标识</th>
              <th>描述</th>
              <th>英文名称</th>
              {groups && <th>排序</th>}
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {items.map((tag) => (
              <tr key={tag.id}>
                <td>
                  <span className="person">
                    <TagIcon />
                    {tag.name}
                  </span>
                </td>
                <td>
                  <code>{tag.slug}</code>
                </td>
                <td className="excerpt">{tag.description || '—'}</td>
                <td>{tag.nameEn || '回退中文'}</td>
                {groups && <td>{'order' in tag ? tag.order : 0}</td>}
                <td>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEdit(tag)}
                    aria-label={`编辑${label} ${tag.name}`}
                  >
                    <PencilSimple />
                    编辑
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <div className="pagination">
        <span>
          已加载 {list.items.length} 个{label}
        </span>
        <LoadMore {...list} />
      </div>
      {edit && (
        <TagForm
          key={edit === 'new' ? 'new' : edit.id}
          tag={edit === 'new' ? undefined : edit}
          done={done}
          groups={groups}
        />
      )}
    </>
  );
}

export default function Tags() {
  return <TaxonomyPage />;
}
