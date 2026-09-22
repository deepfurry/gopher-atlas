import { useState } from 'react';
import { z } from 'zod';
import {
  Controller,
  useFieldArray,
  useFormContext,
  useWatch,
} from 'react-hook-form';
import {
  Plus,
  Trash,
  SlidersHorizontal,
  Article,
  MagnifyingGlass,
} from '@phosphor-icons/react';
import { CoverField } from '@/features/assets/editor-assets';
import { useMe } from '@/app/context';
import type { Schema } from '@/shared/api';
import { name, ratings, difficulties } from '@/shared/status';
import { Select } from '@/components/ui/select';
import { NoteGroupFields } from './note-group';
import { Button, IconButton } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Checkbox, Switch } from '@/components/ui/checkbox';
import { DatePicker } from '@/components/ui/date-picker';
import { Tabs, TabPanel } from '@/components/ui/tabs';
import { AuthorSelect, TagSelect, TopicEntries } from './selectors';
import { routePreview, type Content, type Snapshot } from './api';
z.config(z.locales.zhCN());
const text = (max: number) => z.string().max(max);
export const draftSchema = z.object({
  coverAssetId: z.number().int().positive().nullable(),
  title: text(200),
  slug: text(100).regex(
    /^(?:[a-z0-9]+(?:-[a-z0-9]+)*)?$/,
    '请使用小写字母或数字，并以短横线分隔。',
  ),
  summary: text(4000),
  bodyMarkdown: z
    .string()
    .refine(
      (value) => new TextEncoder().encode(value).length <= 524288,
      'Markdown 超过 512 KiB 限制。',
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
      groupDescription: text(1000).optional(),
      groupOrder: z.number().int().min(0).max(1000000).optional(),
      recommendedCount: z.number().int().min(0).max(100).optional(),
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
      difficulty: z
        .enum(['', 'beginner', 'intermediate', 'advanced'])
        .optional(),
      rating: z.enum(['', ...ratings]).optional(),
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
        <Textarea rows={3} maxLength={max} {...register(field)} />
      ) : (
        <Input maxLength={max} {...register(field)} />
      )}
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
    'relatedLinks' | 'mustRead' | 'order' | 'groupOrder' | 'recommendedCount'
  >;
  type?: string;
}) {
  const {
    register,
    formState: { errors },
  } = useFormContext<FormValues>();
  return (
    <label>
      {label}
      <Input type={type} {...register(`payload.${field}`)} />
      {errors.payload?.[field] && (
        <span className="error-message">{errors.payload[field]?.message}</span>
      )}
    </label>
  );
}
function Order({ label = '排序' }: { label?: string }) {
  const { register } = useFormContext<FormValues>();
  return (
    <label>
      {label}
      <Input
        type="number"
        min={0}
        max={1000000}
        {...register('payload.order', { valueAsNumber: true })}
      />
      <span className="caption">数值越小，位置越靠前。</span>
    </label>
  );
}
function RelatedLinks() {
  const { control, register } = useFormContext<FormValues>();
  const array = useFieldArray({ control, name: 'payload.relatedLinks' });
  return (
    <fieldset className="related-links">
      <legend>相关链接</legend>
      {array.fields.map((field, index) => (
        <div className="related-link" key={field.id}>
          <div className="section-heading">
            <h3>链接 {index + 1}</h3>
            <IconButton
              label={`删除链接 ${index + 1}`}
              onClick={() => array.remove(index)}
            >
              <Trash />
            </IconButton>
          </div>
          <label>
            链接 {index + 1} 名称
            <Input {...register(`payload.relatedLinks.${index}.label`)} />
          </label>
          <label>
            链接 {index + 1} URL
            <Input
              type="url"
              {...register(`payload.relatedLinks.${index}.url`)}
            />
          </label>
        </div>
      ))}
      <Button
        variant="outline"
        disabled={array.fields.length >= 20}
        onClick={() => array.append({ label: '', url: '' })}
      >
        <Plus />
        添加相关链接
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
  const { control, setValue } = useFormContext<FormValues>();
  const recommendedCount =
    useWatch({ control, name: 'payload.recommendedCount' }) ?? 0;
  switch (type) {
    case 'post':
      return (
        <p className="caption">使用 Markdown 编写正文，并完善基础属性。</p>
      );
    case 'note':
      return (
        <>
          <NoteGroupFields id={id} />
          <Order label="组内排序" />
        </>
      );
    case 'curated_article':
      return (
        <>
          <p className="caption">
            收录外部优质文章。Markdown 用于收录理由 /
            编辑点评，不抓取或转载原文。
          </p>
          <PayloadField label="原文地址" field="sourceUrl" type="url" />
          <PayloadField label="原始出处 URL" field="originalUrl" type="url" />
          <PayloadField label="外部作者" field="sourceAuthor" />
          <PayloadField label="来源平台" field="sourceName" />
          <label>
            原文发布日期
            <Controller
              control={control}
              name="payload.sourcePublishedAt"
              render={({ field }) => (
                <DatePicker
                  label="原文发布日期"
                  value={field.value ?? ''}
                  onValueChange={field.onChange}
                />
              )}
            />
          </label>
          <PayloadField label="原文语言" field="sourceLanguage" />
          <div className="form-pair">
            <Controller
              control={control}
              name="payload.difficulty"
              render={({ field }) => (
                <Select
                  label="难度"
                  value={field.value ?? ''}
                  onValueChange={field.onChange}
                  options={[
                    { value: '', label: '选择难度' },
                    ...Object.entries(difficulties).map(([value, label]) => ({
                      value,
                      label,
                    })),
                  ]}
                />
              )}
            />
            <Controller
              control={control}
              name="payload.rating"
              render={({ field }) => (
                <Select
                  label="评级"
                  value={field.value ?? ''}
                  onValueChange={field.onChange}
                  options={[
                    { value: '', label: '选择评级' },
                    ...ratings.map((value) => ({ value, label: value })),
                  ]}
                />
              )}
            />
          </div>
          <Controller
            control={control}
            name="payload.mustRead"
            render={({ field }) => (
              <Checkbox
                label="标记为必读"
                checked={field.value ?? false}
                onCheckedChange={field.onChange}
              />
            )}
          />
          <RelatedLinks />
        </>
      );
    case 'topic':
      return (
        <>
          <Order label="专区排序" />
          <Controller
            control={control}
            name="topicEntries"
            render={({ field }) => (
              <TopicEntries
                id={id}
                value={field.value}
                onChange={field.onChange}
                initial={initial}
                recommendedCount={recommendedCount}
                onRecommendedCountChange={(count) =>
                  setValue('payload.recommendedCount', count, {
                    shouldDirty: true,
                  })
                }
              />
            )}
          />
        </>
      );
  }
}
export function EditorTitle({ type }: { type?: Schema<'ContentType'> }) {
  const {
    register,
    formState: { errors },
  } = useFormContext<FormValues>();
  return (
    <div className="editor-title-field">
      <label className="sr-only" htmlFor="content-title">
        标题
      </label>
      <Input
        id="content-title"
        className="editor-title-input"
        placeholder="为内容起一个标题…"
        maxLength={200}
        {...register('title')}
      />
      {errors.title && (
        <span className="error-message">{errors.title.message}</span>
      )}
      {type && (
        <Field
          label={
            type === 'curated_article'
              ? '文章摘要'
              : type === 'topic'
                ? '专区简介'
                : '随笔摘要'
          }
          field="summary"
          max={4000}
          multiline
        />
      )}
    </div>
  );
}
export function Metadata({ content }: { content: Content }) {
  const me = useMe();
  const { control, setValue } = useFormContext<FormValues>();
  const values = useWatch({ control });
  const [tab, setTab] = useState(content.type === 'post' ? 'basic' : 'type');
  return (
    <aside className="metadata-rail" aria-label="内容属性">
      <div className="inspector-heading">
        <SlidersHorizontal />
        <h2>内容属性</h2>
      </div>
      <Tabs
        label="属性分组"
        value={tab}
        onValueChange={setTab}
        items={[
          {
            value: 'type',
            label:
              content.type === 'curated_article'
                ? '原文与策展'
                : content.type === 'topic'
                  ? '文章编排'
                  : '分组',
            icon: <Article />,
          },
          { value: 'basic', label: '发布属性', icon: <SlidersHorizontal /> },
          { value: 'seo', label: '搜索展示', icon: <MagnifyingGlass /> },
        ]}
      >
        <TabPanel value="basic" className="inspector-panel" keepMounted>
          <CoverField initial={content.draft?.coverAsset ?? null} />
          <Field label="路径标识" field="slug" max={100} />
          <p className="caption">
            使用小写字母或数字，以短横线分隔；不会自动生成。
          </p>
          <output className="route-preview" aria-label="预览路径">
            {routePreview(
              content.type,
              values.slug ?? '',
              values.payload ?? {},
            )}
          </output>
          <Field label="语言" field="language" max={32} />
          {content.actions.assignByline ? (
            <label>
              署名作者
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
            </label>
          ) : (
            <label>
              署名作者
              <Input
                aria-label="署名作者"
                readOnly
                value={
                  values.bylineUserId === me.user.id
                    ? me.profile.displayName
                    : name(content.byline)
                }
              />
              <span className="caption">编辑和审核员只能使用自己的署名。</span>
            </label>
          )}
          {!content.actions.assignByline &&
            content.actions.editDraft &&
            values.bylineUserId !== me.user.id && (
              <div className="review-feedback">
                <p>当前署名与登录账户不同，继续编辑前请选择自己的署名。</p>
                <Button
                  variant="outline"
                  onClick={() =>
                    setValue('bylineUserId', me.user.id, { shouldDirty: true })
                  }
                >
                  使用我的署名
                </Button>
              </div>
            )}
          {content.actions.setFeatured ? (
            <Controller
              name="featured"
              control={control}
              render={({ field }) => (
                <Switch
                  label="首页推荐"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              )}
            />
          ) : content.draft?.featured ? (
            <p className="caption">重点推荐 · 由管理员管理</p>
          ) : null}
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
        </TabPanel>
        <TabPanel value="type" className="inspector-panel" keepMounted>
          <TypeFields
            type={content.type}
            id={content.id}
            initial={content.draft?.topicTargets ?? []}
          />
        </TabPanel>
        <TabPanel value="seo" className="inspector-panel" keepMounted>
          <p className="caption">
            控制搜索结果展示。留空时使用内容标题与摘要。
          </p>
          <Field label="搜索标题" field="seoTitle" max={120} />
          <Field label="搜索描述" field="seoDescription" max={320} multiline />
        </TabPanel>
      </Tabs>
    </aside>
  );
}
