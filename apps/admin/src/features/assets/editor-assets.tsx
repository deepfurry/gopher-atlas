import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { useFormContext, useWatch } from 'react-hook-form';
import { isControlledImage } from '@/shared/asset-policy';
import { ImageSquare, X } from '@phosphor-icons/react';
import type { Schema } from '@/shared/api';
import type { FormValues } from '@/features/content/form';
import type { MarkdownInsertion } from '@/features/content/markdown-editor';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { AssetBrowser, AssetImage } from './browser';
export function AssetPicker({
  open,
  close,
  select,
}: {
  open: boolean;
  close: () => void;
  select: (asset: Schema<'Asset'>) => void;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !next && close()}
      title="选择素材"
      description="从素材库选择图片，或上传新图片。"
      className="asset-dialog"
    >
      <AssetBrowser select={select} />
    </Dialog>
  );
}
export function CoverField({
  initial,
}: {
  initial: Schema<'AssetSummary'> | null;
}) {
  const { control, setValue } = useFormContext<FormValues>();
  const id = useWatch({ control, name: 'coverAssetId' });
  const [selected, setSelected] = useState<Schema<'AssetSummary'> | null>(
      initial,
    ),
    [open, setOpen] = useState(false);
  return (
    <section aria-label="封面素材" className="cover-field">
      <h3>封面</h3>
      <div className="cover-picker-row">
        <div className="cover-preview">
          {id !== null && selected?.id === id ? (
            <AssetImage asset={selected} />
          ) : (
            <ImageSquare aria-hidden="true" />
          )}
        </div>
        <div className="cover-actions">
          <p className="caption">{id !== null ? `素材 ${id}` : '未选择封面'}</p>
          <div className="toolbar">
            <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
              {id !== null ? '更换封面' : '选择封面'}
            </Button>
            {id !== null && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  setValue('coverAssetId', null, { shouldDirty: true })
                }
              >
                <X />
                移除封面
              </Button>
            )}
          </div>
        </div>
      </div>
      <AssetPicker
        open={open}
        close={() => setOpen(false)}
        select={(asset) => {
          setSelected(asset);
          setValue('coverAssetId', asset.id, { shouldDirty: true });
          setOpen(false);
        }}
      />
    </section>
  );
}
export function imageMarkdown(alt: string, url: string) {
  if (
    !alt.trim() ||
    alt.length > 500 ||
    /[\r\n]/.test(alt) ||
    !isControlledImage(url)
  )
    throw new Error('invalid_image');
  return `![${alt.trim().replace(/[\\[\]]/g, '\\$&')}](${url})`;
}
export function InsertImage({ capture }: { capture: () => MarkdownInsertion }) {
  const insertion = useRef<MarkdownInsertion | null>(null);
  const pending = useRef<string | null>(null);
  const cancel = () => {
    insertion.current = null;
    pending.current = null;
    setAsset(null);
    setOpen(false);
  };
  const [open, setOpen] = useState(false),
    [asset, setAsset] = useState<Schema<'Asset'> | null>(null),
    [alt, setAlt] = useState('');
  return (
    <div className="insert-image">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          insertion.current = capture();
          pending.current = null;
          setOpen(true);
        }}
      >
        <ImageSquare />
        插入图片
      </Button>
      <AssetPicker
        open={open}
        close={cancel}
        select={(value) => {
          setAsset(value);
          setAlt('');
          setOpen(false);
        }}
      />
      <Dialog
        open={!!asset}
        onOpenChange={(next) => !next && cancel()}
        onOpenChangeComplete={(next) => {
          if (next || pending.current === null) return;
          const markdown = pending.current;
          pending.current = null;
          if (!insertion.current?.insert(markdown))
            toast.error('正文或编辑模式已变化，请重新选择插入位置。');
          insertion.current = null;
        }}
        title="插入图片"
        description={
          insertion.current?.atEnd
            ? '尚未定位源码光标，图片将添加到正文末尾。替代文本有助于无障碍阅读。'
            : '图片将插入打开素材库前的光标位置，替换当时选中的文字。替代文本有助于无障碍阅读。'
        }
        footer={
          <>
            <Button variant="outline" onClick={cancel}>
              取消
            </Button>
            <Button
              disabled={!alt.trim()}
              onClick={() => {
                if (!asset) return;
                pending.current = imageMarkdown(alt, asset.url);
                setAsset(null);
              }}
            >
              插入所选图片
            </Button>
          </>
        }
      >
        {asset && (
          <div className="image-insert-form">
            <AssetImage asset={asset} />
            <label>
              图片替代文本
              <Input
                value={alt}
                maxLength={500}
                onChange={(e) => setAlt(e.target.value)}
                placeholder="简要描述图片内容…"
                required
                autoFocus
              />
            </label>
          </div>
        )}
      </Dialog>
    </div>
  );
}
