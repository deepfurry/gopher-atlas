import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { isControlledImage } from '@gopheratlas/markdown';
import { toast } from 'sonner';
import {
  UploadSimple,
  Copy,
  Trash,
  ArrowCounterClockwise,
  ImageSquare,
  Check,
} from '@phosphor-icons/react';
import { useMe } from '@/app/context';
import { client, unwrap, ErrorNotice, type Schema } from '@/shared/api';
import { usePages } from '@/shared/query';
import { LoadMore } from '@/shared/pagination';
import { useConfirm } from '@/shared/confirm';
import { date } from '@/shared/status';
import { Button, IconButton } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState, LoadingState, Badge } from '@/components/ui/workspace';
export function AssetImage({ asset }: { asset: Schema<'AssetSummary'> }) {
  const [failed, setFailed] = useState(false);
  return isControlledImage(asset.url) && !failed ? (
    <img
      className="asset-thumbnail"
      src={asset.url}
      alt={`素材 ${asset.id}`}
      width={asset.width}
      height={asset.height}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  ) : (
    <span className="asset-image-fallback">
      <ImageSquare />
      {failed ? '图片暂时无法加载' : '图片 URL 不安全'}
    </span>
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
  const [includeDeleted, setIncludeDeleted] = useState(false),
    [file, setFile] = useState<File | null>(null),
    [clipboardError, setClipboardError] = useState<unknown>(null),
    [preview, setPreview] = useState<Schema<'Asset'> | null>(null);
  const input = useRef<HTMLInputElement>(null);
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
      if (input.current) input.current.value = '';
      await refresh();
      toast.success('素材已上传。');
      select?.(asset);
    },
  });
  const change = useMutation({
    mutationFn: async (asset: Schema<'Asset'>) => {
      const restore = asset.deletedAt !== null;
      if (
        !(await confirm({
          title: restore ? '恢复此素材？' : '删除此素材？',
          description:
            '删除后不再出现在选择器中。已发布的封面与正文图片仍然可用，原始文件会保留。',
          confirm: restore ? '恢复素材' : '删除素材',
          danger: !restore,
        }))
      )
        return null;
      return unwrap(
        await client.POST(
          restore
            ? '/api/admin/v1/assets/{id}/actions/restore'
            : '/api/admin/v1/assets/{id}/actions/delete',
          { params: { path: { id: asset.id } } },
        ),
      );
    },
    onSuccess: async (result) => {
      if (result) {
        await refresh();
        toast.success(result.deletedAt ? '素材已删除。' : '素材已恢复。');
      }
    },
  });
  const copy = (asset: Schema<'Asset'>) => {
    void navigator.clipboard
      .writeText(asset.url)
      .then(() => toast.success('素材 URL 已复制。'))
      .catch(setClipboardError);
  };
  return (
    <div className="asset-browser">
      <div
        className="asset-upload-zone"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (!upload.isPending) setFile(e.dataTransfer.files[0] ?? null);
        }}
      >
        <UploadSimple />
        <div className="asset-upload-copy">
          <strong>上传图片素材</strong>
          <p className="caption">
            拖入文件或选择图片 · PNG / JPEG / WebP / GIF · 最大 10 MiB
          </p>
        </div>
        <input
          className="sr-only"
          ref={input}
          type="file"
          aria-label="选择图片文件"
          accept="image/png,image/jpeg,image/webp,image/gif"
          disabled={upload.isPending}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <Button
          variant="outline"
          disabled={upload.isPending}
          onClick={() => input.current?.click()}
        >
          选择图片
        </Button>
        {file && (
          <>
            <span className="caption selected-file">{file.name}</span>
            <Button
              disabled={upload.isPending || file.size > 10485760}
              onClick={() => upload.mutate(file)}
            >
              <UploadSimple />
              {upload.isPending ? '正在上传…' : '上传图片'}
            </Button>
          </>
        )}
      </div>
      <p className="caption asset-limits">
        单边不超过 16,384 像素，总像素不超过 1 亿。保留原始二进制元数据。
      </p>
      {file && file.size > 10485760 && (
        <p role="alert" className="error-message">
          图片超过 10 MiB 限制。
        </p>
      )}
      <div className="section-heading">
        <span className="caption">已加载 {list.items.length} 个素材</span>
        {!select && me.permissions.manageAssets && (
          <Checkbox
            label="包含已删除素材"
            checked={includeDeleted}
            onCheckedChange={setIncludeDeleted}
          />
        )}
      </div>
      <ErrorNotice
        error={list.error || upload.error || change.error || clipboardError}
      />
      {list.isPending ? (
        <LoadingState label="正在加载素材…" />
      ) : !list.items.length ? (
        <EmptyState
          title="素材库还是空的"
          description="上传第一张图片，为内容添加封面或正文插图。"
        />
      ) : (
        <ul className="asset-grid" aria-label="素材库">
          {list.items.map((asset) => (
            <li
              key={asset.id}
              className={asset.deletedAt !== null ? 'asset-deleted' : ''}
            >
              <button
                type="button"
                className="asset-preview-button"
                aria-label={`预览素材 ${asset.id}`}
                onClick={() => setPreview(asset)}
              >
                <AssetImage asset={asset} />
              </button>
              <div className="asset-info">
                <div className="section-heading">
                  <strong>素材 {asset.id}</strong>
                  {asset.deletedAt !== null && <Badge>已删除</Badge>}
                </div>
                <p className="caption">
                  {asset.width} × {asset.height} ·{' '}
                  {(asset.byteSize / 1024).toFixed(1)} KiB
                </p>
                <p className="caption">
                  {asset.mimeType.replace('image/', '').toUpperCase()} ·{' '}
                  {date(asset.createdAt)}
                </p>
                <div className="asset-actions">
                  {select && asset.deletedAt === null && (
                    <Button
                      size="sm"
                      onClick={() => select(asset)}
                      aria-label={`选择素材 ${asset.id}`}
                    >
                      <Check />
                      选择
                    </Button>
                  )}
                  <IconButton
                    label={`复制素材 ${asset.id} 的 URL`}
                    onClick={() => copy(asset)}
                  >
                    <Copy />
                  </IconButton>
                  {!select &&
                    (asset.actions.delete || asset.actions.restore) && (
                      <IconButton
                        label={`${asset.actions.restore ? '恢复' : '删除'}素材 ${asset.id}`}
                        disabled={change.isPending}
                        onClick={() => change.mutate(asset)}
                      >
                        {asset.actions.restore ? (
                          <ArrowCounterClockwise />
                        ) : (
                          <Trash />
                        )}
                      </IconButton>
                    )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="pagination">
        <span>历史引用不会因素材删除而失效。</span>
        <LoadMore {...list} />
      </div>
      <Dialog
        open={!!preview}
        onOpenChange={(open) => !open && setPreview(null)}
        title={`素材 ${preview?.id ?? ''}`}
        className="asset-preview-dialog"
        footer={
          <Button variant="outline" onClick={() => preview && copy(preview)}>
            <Copy />
            复制 URL
          </Button>
        }
      >
        {preview && (
          <>
            <AssetImage asset={preview} />
            <p className="caption">
              {preview.width} × {preview.height} · {preview.mimeType} ·{' '}
              {(preview.byteSize / 1024).toFixed(1)} KiB
            </p>
          </>
        )}
      </Dialog>
    </div>
  );
}
