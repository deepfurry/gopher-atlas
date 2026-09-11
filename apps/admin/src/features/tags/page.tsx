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
  name: z.string().trim().min(1, '请输入标签名称').max(100),
  slug: z
    .string()
    .max(100)
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      '请使用小写字母或数字，并以短横线分隔。',
    ),
  description: z.string().max(1000),
});
function TagForm({ tag, done }: { tag?: Schema<'Tag'>; done: () => void }) {
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: tag
      ? { name: tag.name, slug: tag.slug, description: tag.description }
      : { name: '', slug: '', description: '' },
  });
  const save = useMutation({
    mutationFn: async (body: z.infer<typeof schema>) =>
      tag
        ? unwrap(
            await client.PUT('/api/admin/v1/tags/{id}', {
              params: { path: { id: tag.id } },
              body,
            }),
          )
        : unwrap(await client.POST('/api/admin/v1/tags', { body })),
    onSuccess: () => {
      toast.success('标签已保存。');
      done();
    },
  });
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && done()}
      title={tag ? '编辑标签' : '新建标签'}
      busy={save.isPending}
      footer={
        <>
          <Button variant="outline" disabled={save.isPending} onClick={done}>
            取消
          </Button>
          <Button type="submit" form="tag-form" disabled={save.isPending}>
            {save.isPending ? '正在保存…' : '保存标签'}
          </Button>
        </>
      }
    >
      <form
        id="tag-form"
        className="compact-form"
        onSubmit={form.handleSubmit((value) => save.mutate(value))}
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
          help="修改名称不会自动改变路径标识。"
        >
          {(props) => <Input {...props} {...form.register('slug')} />}
        </FormField>
        <FormField
          label="描述"
          error={form.formState.errors.description?.message}
        >
          {(props) => (
            <Textarea {...props} rows={3} {...form.register('description')} />
          )}
        </FormField>
        <ErrorNotice error={save.error} />
      </form>
    </Dialog>
  );
}
export default function Tags() {
  const me = useMe(),
    cache = useQueryClient();
  const [edit, setEdit] = useState<Schema<'Tag'> | 'new' | null>(null),
    [search, setSearch] = useState('');
  const list = usePages(
    ['tags'],
    async (after, signal) =>
      unwrap(
        await client.GET('/api/admin/v1/tags', {
          signal,
          params: { query: { after } },
        }),
      ),
    me.permissions.manageTaxonomy,
  );
  if (!me.permissions.manageTaxonomy) return <NoAccess />;
  const done = () => {
    setEdit(null);
    void cache.invalidateQueries({ queryKey: ['tags'] });
  };
  const items = list.items.filter((tag) =>
    `${tag.name} ${tag.slug}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <>
      <PageHeader
        title="标签"
        description="维护内容分类。标签路径标识持久保留，不随名称自动变化。"
        actions={
          <Button onClick={() => setEdit('new')}>
            <Plus />
            新建标签
          </Button>
        }
      />
      <div className="filter-bar">
        <SearchInput
          aria-label="搜索已加载标签"
          placeholder="搜索已加载标签…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <ErrorNotice error={list.error} />
      {list.isPending ? (
        <LoadingState />
      ) : !items.length ? (
        <EmptyState
          title="没有匹配的标签"
          description="创建标签后，可在文章、笔记和精选中选择。"
        />
      ) : (
        <Table label="标签列表">
          <thead>
            <tr>
              <th>名称</th>
              <th>路径标识</th>
              <th>描述</th>
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
                <td>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEdit(tag)}
                    aria-label={`编辑标签 ${tag.name}`}
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
        <span>已加载 {list.items.length} 个标签</span>
        <LoadMore {...list} />
      </div>
      {edit && (
        <TagForm
          key={edit === 'new' ? 'new' : edit.id}
          tag={edit === 'new' ? undefined : edit}
          done={done}
        />
      )}
    </>
  );
}
