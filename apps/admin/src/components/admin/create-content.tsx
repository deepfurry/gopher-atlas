import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import {
  Plus,
  Article,
  Notebook,
  BookmarkSimple,
  Stack,
} from '@phosphor-icons/react';
import { useMe } from '@/app/context';
import { client, unwrap, ErrorNotice, type Schema } from '@/shared/api';
import { types, productTypes } from '@/shared/status';
import { Button } from '@/components/ui/button';
import { DropdownMenu, MenuItem, MenuLabel } from '@/components/ui/menu';
const icons = {
  post: Article,
  note: Notebook,
  curated_article: BookmarkSimple,
  topic: Stack,
};
export function CreateContent({ compact = false }: { compact?: boolean }) {
  const me = useMe(),
    navigate = useNavigate();
  const create = useMutation({
    mutationFn: async (type: Schema<'ContentType'>) =>
      unwrap(await client.POST('/api/admin/v1/content', { body: { type } })),
    onSuccess: (item) => navigate(`/content/${item.id}`),
  });
  return (
    <div className="create-content">
      <DropdownMenu
        trigger={
          <Button
            disabled={create.isPending}
            aria-label="新建内容"
            className={compact ? 'quick-create' : ''}
          >
            <Plus />
            <span>新建内容</span>
          </Button>
        }
        label="选择内容类型"
      >
        <MenuLabel>开始一份新内容</MenuLabel>
        {productTypes
          .filter((type) => type !== 'topic' || me.permissions.createTopic)
          .map((type) => {
            const Icon = icons[type as keyof typeof icons];
            return (
              <MenuItem
                key={type}
                onClick={() => create.mutate(type as Schema<'ContentType'>)}
              >
                <Icon />
                新建{types[type]}
              </MenuItem>
            );
          })}
      </DropdownMenu>
      <ErrorNotice error={create.error} />
    </div>
  );
}
