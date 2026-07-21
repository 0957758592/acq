import * as Yup from 'yup';

import { validationKeys } from '../keys.js';
import { jsonStringSchema } from './_helpers.js';

const hreflangSchema = Yup.object({
  locale: Yup.string().trim(),
  url: Yup.string().trim().url(validationKeys.seo.routeOverride.hreflangUrl.invalid)
});

const routeOverrideSchema = Yup.object({
  routeKey: Yup.string().trim().required(validationKeys.seo.routeOverride.routeKey.required),
  routePath: Yup.string().trim(),
  title: Yup.string().trim(),
  description: Yup.string().trim(),
  canonicalUrl: Yup.string().trim().url(validationKeys.seo.routeOverride.canonicalUrl.invalid),
  ogImageUrl: Yup.string().trim().url(validationKeys.seo.routeOverride.ogImageUrl.invalid),
  twitterImageUrl: Yup.string().trim().url(validationKeys.seo.routeOverride.twitterImageUrl.invalid),
  indexable: Yup.boolean(),
  structuredDataJson: jsonStringSchema(validationKeys.seo.routeOverride.structuredDataJson.invalid),
  hreflang: Yup.array().of(hreflangSchema)
});

export const seoSettingsSchema = Yup.object({
  siteName: Yup.string().trim(),
  defaultTitle: Yup.string().trim(),
  defaultDescription: Yup.string().trim(),
  defaultOgImageUrl: Yup.string().trim().url(validationKeys.seo.defaultOgImageUrl.invalid),
  defaultTwitterImageUrl: Yup.string()
    .trim()
    .url(validationKeys.seo.defaultTwitterImageUrl.invalid),
  defaultCanonicalBase: Yup.string().trim().url(validationKeys.seo.defaultCanonicalBase.invalid),
  robotsTxt: Yup.string(),
  structuredDataJson: jsonStringSchema(validationKeys.seo.structuredDataJson.invalid),
  hreflangLocales: Yup.array()
    .of(Yup.string().trim())
    .min(1, validationKeys.seo.hreflangLocales.min),
  defaultLocale: Yup.string()
    .trim()
    .required(validationKeys.seo.defaultLocale.required)
    .test('default-locale', validationKeys.seo.defaultLocale.oneOf, function (value) {
      const locales = this.parent?.hreflangLocales || [];
      if (!value) return false;
      return locales.includes(value);
    }),
  routeOverrides: Yup.array().of(routeOverrideSchema)
});


