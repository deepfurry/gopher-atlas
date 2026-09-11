import { useState } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { useFormContext, useWatch } from 'react-hook-form';
import { isControlledImage } from '@gopheratlas/markdown';
import type { Schema } from '@/shared/api';
import type { FormValues } from '@/features/content/form';
import { Button } from '@/components/ui/button';
import { AssetBrowser, AssetImage } from './browser';

function Picker({
  open,
  close,
  select,
}: {
  open: boolean;
  close: () => void;
  select: (asset: Schema<'Asset'>) => void;
}) {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="dialog-backdrop" />
        <Dialog.Popup className="dialog asset-dialog">
          <Dialog.Title>Select immutable asset</Dialog.Title>
          <Dialog.Description>
            Choose an existing asset or upload a supported image.
          </Dialog.Description>
          <AssetBrowser select={select} />
          <Button variant="outline" onClick={close}>
            Cancel asset selection
          </Button>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
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
  );
  const [open, setOpen] = useState(false);
  return (
    <section aria-label="Cover asset" className="cover-field">
      <h3>Cover</h3>
      {id !== null && selected?.id === id && <AssetImage asset={selected} />}
      <p className="caption">
        {id === null ? 'No cover selected.' : `Cover asset ${id}`}
      </p>
      <div className="toolbar">
        <Button variant="outline" onClick={() => setOpen(true)}>
          Choose cover
        </Button>
        {id !== null && (
          <Button
            variant="outline"
            onClick={() =>
              setValue('coverAssetId', null, { shouldDirty: true })
            }
          >
            Remove cover
          </Button>
        )}
      </div>
      <Picker
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
    <section className="insert-image" aria-label="Insert image">
      <Button variant="outline" onClick={() => setOpen(true)}>
        Insert image
      </Button>
      <Picker
        open={open}
        close={() => setOpen(false)}
        select={(value) => {
          setAsset(value);
          setAlt('');
          setOpen(false);
        }}
      />
      {asset && (
        <div className="compact-form">
          <p>Asset {asset.id} · appended at the end of Markdown</p>
          <label>
            Image alt text
            <input
              value={alt}
              maxLength={500}
              onChange={(event) => setAlt(event.target.value)}
              required
            />
          </label>
          <div className="toolbar">
            <Button
              disabled={!alt.trim()}
              onClick={() => {
                setValue(
                  'bodyMarkdown',
                  `${getValues('bodyMarkdown')}\n\n${imageMarkdown(alt, asset.url)}\n`,
                  { shouldDirty: true },
                );
                setAsset(null);
              }}
            >
              Insert selected image
            </Button>
            <Button variant="outline" onClick={() => setAsset(null)}>
              Cancel image insertion
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
