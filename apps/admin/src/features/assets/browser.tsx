import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { isControlledImage } from '@gopheratlas/markdown';
import { toast } from 'sonner';
import { useMe } from '@/app/context';
import { client, unwrap, ErrorNotice, type Schema } from '@/shared/api';
import { usePages } from '@/shared/query';
import { LoadMore } from '@/shared/pagination';
import { useConfirm } from '@/shared/confirm';
import { date } from '@/shared/status';
import { Button } from '@/components/ui/button';

export function AssetImage({ asset }: { asset: Schema<'AssetSummary'> }) {
  return isControlledImage(asset.url) ? (
    <img
      className="asset-thumbnail"
      src={asset.url}
      alt={`Asset ${asset.id}`}
      width={asset.width}
      height={asset.height}
      loading="lazy"
      referrerPolicy="no-referrer"
    />
  ) : (
    <span role="alert">Unsafe image URL</span>
  );
}
export async function uploadAsset(file: File) {
  return unwrap(
    await client.POST('/api/admin/v1/assets', {
      body: { file: file as unknown as string },
      bodySerializer: () => {
        const body = new FormData();
        body.append('file', file);
        return body;
      },
    }),
  );
}
export function AssetBrowser({
  select,
}: {
  select?: (asset: Schema<'Asset'>) => void;
}) {
  const me = useMe(),
    cache = useQueryClient(),
    confirm = useConfirm();
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [clipboardError, setClipboardError] = useState<unknown>(null);
  const list = usePages(
    ['assets', { includeDeleted }],
    async (after, signal) =>
      unwrap(
        await client.GET('/api/admin/v1/assets', {
          signal,
          params: { query: { after, includeDeleted } },
        }),
      ),
    me.permissions.uploadAssets,
  );
  const refresh = async () => {
    await cache.invalidateQueries({ queryKey: ['assets'] });
    await cache.invalidateQueries({ queryKey: ['audit'] });
  };
  const upload = useMutation({
    mutationFn: uploadAsset,
    onSuccess: async (asset) => {
      setFile(null);
      await refresh();
      toast.success('Immutable asset uploaded.');
      if (select) select(asset);
    },
  });
  const change = useMutation({
    mutationFn: async (asset: Schema<'Asset'>) => {
      const restore = asset.deletedAt !== null;
      if (
        !(await confirm({
          title: restore ? 'Restore asset?' : 'Delete asset from selection?',
          description:
            'The immutable object remains available. Existing published covers and Markdown URLs are preserved.',
          confirm: restore ? 'Restore asset' : 'Delete asset',
        }))
      )
        return;
      return unwrap(
        await client.POST(
          restore
            ? '/api/admin/v1/assets/{id}/actions/restore'
            : '/api/admin/v1/assets/{id}/actions/delete',
          { params: { path: { id: asset.id } } },
        ),
      );
    },
    onSuccess: refresh,
  });
  return (
    <div className="asset-browser">
      <div className="toolbar asset-upload">
        <label>
          Image file
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
        </label>
        <Button
          disabled={!file || upload.isPending || file.size > 10485760}
          onClick={() => file && upload.mutate(file)}
        >
          {upload.isPending ? 'Uploading…' : 'Upload image'}
        </Button>
      </div>
      <p className="caption">
        PNG / JPEG / WebP / GIF · ≤10 MiB · ≤16384 px per side · ≤100M pixels.
        Binary metadata is retained.
      </p>
      {file && file.size > 10485760 && (
        <p role="alert">Image exceeds 10 MiB.</p>
      )}
      {!select && me.permissions.manageAssets && (
        <label className="check-label">
          <input
            type="checkbox"
            checked={includeDeleted}
            onChange={(e) => setIncludeDeleted(e.target.checked)}
          />
          Include deleted assets
        </label>
      )}
      <ErrorNotice
        error={list.error || upload.error || change.error || clipboardError}
      />
      {list.isPending && <p role="status">Loading assets…</p>}
      <ul className="asset-grid" aria-label="Asset library">
        {list.items.map((asset) => (
          <li key={asset.id}>
            <AssetImage asset={asset} />
            <p>
              <strong>Asset {asset.id}</strong>
              {asset.deletedAt !== null && (
                <span className="badge">Deleted</span>
              )}
            </p>
            <p className="caption">
              {asset.width} × {asset.height} ·{' '}
              {(asset.byteSize / 1024).toFixed(1)} KiB
              <br />
              {asset.mimeType} · {date(asset.createdAt)}
            </p>
            <div className="toolbar">
              {select && asset.deletedAt === null && (
                <Button onClick={() => select(asset)}>
                  Select asset {asset.id}
                </Button>
              )}
              <Button
                variant="outline"
                onClick={() => {
                  void navigator.clipboard
                    .writeText(asset.url)
                    .then(() => toast.success('Asset URL copied.'))
                    .catch(setClipboardError);
                }}
              >
                Copy URL
              </Button>
              {!select && (asset.actions.delete || asset.actions.restore) && (
                <Button
                  variant="outline"
                  disabled={change.isPending}
                  onClick={() => change.mutate(asset)}
                >
                  {asset.actions.restore ? 'Restore' : 'Delete'}
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {!list.items.length && !list.isPending && <p>No assets yet.</p>}
      <LoadMore {...list} />
    </div>
  );
}
