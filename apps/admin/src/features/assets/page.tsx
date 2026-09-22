import { useMe } from '@/app/context';
import { NoAccess } from '@/shared/api';
import { PageHeader } from '@/components/ui/workspace';
import { AssetBrowser } from './browser';
export default function Assets() {
  const me = useMe();
  if (!me.permissions.uploadAssets) return <NoAccess />;
  return (
    <>
      <PageHeader
        title="素材库"
        description="管理内容封面与正文插图。相同图片自动复用，链接长期有效。"
      />
      <AssetBrowser />
    </>
  );
}
