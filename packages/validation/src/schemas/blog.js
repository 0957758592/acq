import * as Yup from 'yup';

import { validationKeys } from '../keys.js';
import { jsonStringSchema } from './_helpers.js';

const hreflangOverrideSchema = Yup.object({
  locale: Yup.string().trim(),
  url: Yup.string().trim().url(validationKeys.blog.post.hreflangUrl.invalid)
});

export const authorSchema = Yup.object({
  name: Yup.string().trim().required(validationKeys.blog.author.name.required),
  slug: Yup.string().trim().required(validationKeys.blog.author.slug.required),
  bio: Yup.string().trim(),
  avatarUrl: Yup.string().trim().url(validationKeys.blog.author.avatarUrl.invalid)
});

export const categorySchema = Yup.object({
  name: Yup.string().trim().required(validationKeys.blog.category.name.required),
  slug: Yup.string().trim().required(validationKeys.blog.category.slug.required),
  description: Yup.string().trim()
});

export const postSchema = Yup.object({
  title: Yup.string().trim().required(validationKeys.blog.post.title.required),
  slug: Yup.string().trim().required(validationKeys.blog.post.slug.required),
  excerpt: Yup.string().trim(),
  contentHtml: Yup.string(),
  status: Yup.string().trim().required(validationKeys.blog.post.status.required),
  publishAt: Yup.string().when('status', {
    is: (value) => value === 'scheduled',
    then: (schema) => schema.required(validationKeys.blog.post.publishAt.required),
    otherwise: (schema) => schema.notRequired()
  }),
  language: Yup.string().trim().required(validationKeys.blog.post.language.required),
  translationKey: Yup.string().trim(),
  tags: Yup.array().of(Yup.string().trim()),
  authorId: Yup.string().nullable(),
  categoryIds: Yup.array().of(Yup.string().trim()),
  coverImageUrl: Yup.string().trim().url(validationKeys.blog.post.coverImageUrl.invalid),
  coverImageAlt: Yup.string().trim(),
  seo: Yup.object({
    metaTitle: Yup.string().trim(),
    metaDescription: Yup.string().trim(),
    ogTitle: Yup.string().trim(),
    ogDescription: Yup.string().trim(),
    ogImageUrl: Yup.string().trim().url(validationKeys.blog.post.ogImageUrl.invalid),
    twitterImageUrl: Yup.string().trim().url(validationKeys.blog.post.twitterImageUrl.invalid),
    canonicalUrl: Yup.string().trim().url(validationKeys.blog.post.canonicalUrl.invalid),
    indexable: Yup.boolean(),
    structuredDataJson: jsonStringSchema(validationKeys.blog.post.structuredDataJson.invalid),
    hreflangOverrides: Yup.array().of(hreflangOverrideSchema)
  })
});


