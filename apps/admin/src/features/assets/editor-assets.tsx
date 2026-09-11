import { useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { isControlledImage } from '@gopheratlas/markdown';
import { ImageSquare, X } from '@phosphor-icons/react';
import type { Schema } from '@/shared/api';
import type { FormValues } from '@/features/content/form';
import { Button, IconButton } from '@/components/ui/button';
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
      <div className="section-heading">
        <h3>封面</h3>
        {id !== null && (
          <IconButton
            label="移除封面"
            onClick={() =>
              setValue('coverAssetId', null, { shouldDirty: true })
            }
          >
            <X />
          </IconButton>
        )}
      </div>
      <button
        type="button"
        className="cover-picker-trigger"
        onClick={() => setOpen(true)}
        aria-label="选择封面"
      >
        {id !== null && selected?.id === id ? (
          <AssetImage asset={selected} />
        ) : (
          <>
            <ImageSquare />
            <span>选择封面图片</span>
          </>
        )}
      </button>
      {id !== null && <p className="caption">素材 {id} · 点击图片更换</p>}
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
export function InsertImage() {
  const { getValues, setValue } = useFormContext<FormValues>();
  const [open, setOpen] = useState(false),
    [asset, setAsset] = useState<Schema<'Asset'> | null>(null),
    [alt, setAlt] = useState('');
  return (
    <div className="insert-image">
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <ImageSquare />
        插入图片
      </Button>
      <AssetPicker
        open={open}
        close={() => setOpen(false)}
        select={(value) => {
          setAsset(value);
          setAlt('');
          setOpen(false);
        }}
      />
      <Dialog
        open={!!asset}
        onOpenChange={(next) => !next && setAsset(null)}
        title="插入图片"
        description="图片将添加到正文末尾。替代文本有助于无障碍阅读。"
        footer={
          <>
            <Button variant="outline" onClick={() => setAsset(null)}>
              取消
            </Button>
            <Button
              disabled={!alt.trim()}
              onClick={() => {
                if (!asset) return;
                setValue(
                  'bodyMarkdown',
                  `${getValues('bodyMarkdown')}\n\n${imageMarkdown(alt, asset.url)}\n`,
                  { shouldDirty: true },
                );
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
