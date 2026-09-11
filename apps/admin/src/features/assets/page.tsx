import { useMe } from '@/app/context';
import { NoAccess } from '@/shared/api';
import { AssetBrowser } from './browser';
export default function Assets() {
  const me = useMe();
  if (!me.permissions.uploadAssets) return <NoAccess />;
  return (
    <>
      <div className="page-heading">
        <h1>Assets</h1>
      </div>
      <AssetBrowser />
    </>
  );
}
