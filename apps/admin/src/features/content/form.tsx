import { z } from 'zod';
import { useMe } from '@/app/context';
import {
  Controller,
  useFieldArray,
  useFormContext,
  useWatch,
} from 'react-hook-form';
import type { Schema } from '@/shared/api';
import { name } from '@/shared/status';
import { Button } from '@/components/ui/button';
import { AuthorSelect, TagSelect, TopicEntries } from './selectors';
import { routePreview, type Content, type Snapshot } from './api';
const text = (max: number) => z.string().max(max);
export const draftSchema = z.object({
  title: text(200),
  slug: text(100).regex(
    /^(?:[a-z0-9]+(?:-[a-z0-9]+)*)?$/,
    'Use lowercase words separated by hyphens.',
  ),
  summary: text(4000),
  bodyMarkdown: z
    .string()
    .refine(
      (value) => new TextEncoder().encode(value).length <= 524288,
      'Markdown exceeds 512 KiB.',
    ),
  bylineUserId: z.number().int().positive(),
  language: text(32),
  featured: z.boolean(),
  seoTitle: text(120),
  seoDescription: text(320),
  tagIds: z.array(z.number().int().positive()).max(100),
  topicEntries: z
    .array(z.object({ targetContentId: z.number().int().positive() }))
    .max(100),
  payload: z
    .object({
      group: text(100).optional(),
      groupSlug: text(100)
        .regex(/^(?:[a-z0-9]+(?:-[a-z0-9]+)*)?$/)
        .optional(),
      order: z.number().int().min(0).max(1000000).optional(),
      sourceUrl: text(2048).optional(),
      originalUrl: text(2048).optional(),
      sourceAuthor: text(200).optional(),
      sourceName: text(200).optional(),
      sourcePublishedAt: text(100).optional(),
      sourceLanguage: text(32).optional(),
      difficulty: text(32).optional(),
      rating: text(16).optional(),
      mustRead: z.boolean().optional(),
      relatedLinks: z
        .array(z.object({ label: text(200), url: text(2048) }))
        .max(20)
        .optional(),
    })
    .strict(),
});
export type FormValues = z.infer<typeof draftSchema>;
export function formValues(snapshot: Snapshot): FormValues {
  return { ...snapshot, payload: { ...snapshot.payload } };
}
function Field({
  label,
  field,
  max,
  multiline = false,
}: {
  label: string;
  field:
    'title' | 'slug' | 'summary' | 'language' | 'seoTitle' | 'seoDescription';
  max: number;
  multiline?: boolean;
}) {
  const {
    register,
    formState: { errors },
  } = useFormContext<FormValues>();
  return (
    <label>
      {label}
      {multiline ? (
        <textarea rows={3} maxLength={max} {...register(field)} />
      ) : (
        <input maxLength={max} {...register(field)} />
      )}{' '}
      {errors[field] && (
        <span className="error-message">{errors[field]?.message}</span>
      )}
    </label>
  );
}
function PayloadField({
  label,
  field,
  type = 'text',
}: {
  label: string;
  field: Exclude<
    keyof FormValues['payload'],
    'relatedLinks' | 'mustRead' | 'order'
  >;
  type?: string;
}) {
  const { register } = useFormContext<FormValues>();
  return (
    <label>
      {label}
      <input type={type} {...register(`payload.${field}`)} />
    </label>
  );
}
function Order() {
  const { register } = useFormContext<FormValues>();
  return (
    <label>
      Order
      <input
        type="number"
        {...register('payload.order', { valueAsNumber: true })}
      />
    </label>
  );
}
function RelatedLinks() {
  const { control, register } = useFormContext<FormValues>();
  const array = useFieldArray({ control, name: 'payload.relatedLinks' });
  return (
    <fieldset>
      <legend>Related links</legend>
      {array.fields.map((field, index) => (
        <div className="related-link" key={field.id}>
          <label>
            Link {index + 1} label
            <input {...register(`payload.relatedLinks.${index}.label`)} />
          </label>
          <label>
            Link {index + 1} URL
            <input
              type="url"
              {...register(`payload.relatedLinks.${index}.url`)}
            />
          </label>
          <Button variant="outline" onClick={() => array.remove(index)}>
            Remove link {index + 1}
          </Button>
        </div>
      ))}
      <Button
        variant="outline"
        disabled={array.fields.length >= 20}
        onClick={() => array.append({ label: '', url: '' })}
      >
        Add related link
      </Button>
    </fieldset>
  );
}
export function TypeFields({
  type,
  id,
  initial,
}: {
  type: Schema<'ContentType'>;
  id: number;
  initial: Schema<'TopicTargetSummary'>[];
}) {
  const { register, control } = useFormContext<FormValues>();
  switch (type) {
    case 'post':
      return <p className="caption">Post uses Markdown and common metadata.</p>;
    case 'note':
      return (
        <>
          <PayloadField label="Group" field="group" />
          <PayloadField label="Group slug" field="groupSlug" />
          <Order />
        </>
      );
    case 'curated_article':
      return (
        <>
          <p className="caption">
            Write your curation and reasoning. Source text is never fetched.
          </p>
          <PayloadField label="Source URL" field="sourceUrl" type="url" />
          <PayloadField label="Original URL" field="originalUrl" type="url" />
          <PayloadField label="Source author" field="sourceAuthor" />
          <PayloadField label="Source name" field="sourceName" />
          <PayloadField
            label="Source published date"
            field="sourcePublishedAt"
          />
          <PayloadField label="Source language" field="sourceLanguage" />
          <PayloadField label="Difficulty" field="difficulty" />
          <PayloadField label="Rating" field="rating" />
          <label className="check-label">
            <input type="checkbox" {...register('payload.mustRead')} />
            Must Read
          </label>
          <RelatedLinks />
        </>
      );
    case 'topic':
      return (
        <>
          <Order />
          <Controller
            control={control}
            name="topicEntries"
            render={({ field }) => (
              <TopicEntries
                id={id}
                value={field.value}
                onChange={field.onChange}
                initial={initial}
              />
            )}
          />
        </>
      );
  }
}
export function Metadata({ content }: { content: Content }) {
  const me = useMe();
  const { control, register, setValue } = useFormContext<FormValues>();
  const values = useWatch({ control });
  return (
    <aside className="metadata-rail" aria-label="Content metadata">
      <h2>Metadata</h2>
      <Field label="Title" field="title" max={200} />
      <Field label="Slug" field="slug" max={100} />
      <p className="caption">
        Explicit slug; lowercase words separated by hyphens.
      </p>
      <output className="route-preview" aria-label="Candidate route">
        {routePreview(content.type, values.slug ?? '', values.payload ?? {})}
      </output>
      <Field label="Summary" field="summary" max={4000} multiline />
      <Field label="Language" field="language" max={32} />
      {content.actions.assignByline ? (
        <Controller
          name="bylineUserId"
          control={control}
          render={({ field }) => (
            <AuthorSelect
              value={field.value}
              onChange={field.onChange}
              selected={content.byline}
            />
          )}
        />
      ) : (
        <label>
          Byline
          <input
            aria-label="Byline"
            readOnly
            value={
              values.bylineUserId === me.user.id
                ? me.profile.displayName
                : name(content.byline)
            }
          />
          <span className="caption">
            Your authorship is fixed for this Draft.
          </span>
        </label>
      )}
      {!content.actions.assignByline &&
        content.actions.editDraft &&
        values.bylineUserId !== me.user.id && (
          <div className="review-feedback">
            <p>
              Your edits must use your own byline. The current assignment is
              preserved until you choose.
            </p>
            <Button
              variant="outline"
              onClick={() =>
                setValue('bylineUserId', me.user.id, { shouldDirty: true })
              }
            >
              Use my byline
            </Button>
          </div>
        )}
      {content.actions.setFeatured ? (
        <label className="check-label">
          <input type="checkbox" {...register('featured')} />
          Featured
        </label>
      ) : content.draft?.featured ? (
        <p className="caption">Featured · managed by Admin</p>
      ) : null}
      <details>
        <summary>SEO</summary>
        <Field label="SEO title" field="seoTitle" max={120} />
        <Field
          label="SEO description"
          field="seoDescription"
          max={320}
          multiline
        />
      </details>
      <fieldset>
        <legend>
          {content.type === 'curated_article'
            ? 'Curated source'
            : content.type === 'topic'
              ? 'Topic'
              : content.type === 'note'
                ? 'Note'
                : 'Post'}
        </legend>
        <TypeFields
          type={content.type}
          id={content.id}
          initial={content.draft?.topicTargets ?? []}
        />
      </fieldset>
      {content.type !== 'topic' && (
        <Controller
          name="tagIds"
          control={control}
          render={({ field }) => (
            <TagSelect
              value={field.value}
              onChange={field.onChange}
              selected={content.draft?.tags}
            />
          )}
        />
      )}
    </aside>
  );
}
