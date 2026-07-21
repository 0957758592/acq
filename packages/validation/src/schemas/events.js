import * as Yup from 'yup';

import { validationKeys } from '../keys.js';

export const eventSchema = Yup.object({
  title: Yup.string().trim().required(validationKeys.events.event.title.required),
  slug: Yup.string().trim().required(validationKeys.events.event.slug.required),
  summary: Yup.string().trim(),
  descriptionHtml: Yup.string(),
  location: Yup.string().trim(),
  startAt: Yup.string().trim().required(validationKeys.events.event.startAt.required),
  endAt: Yup.string().trim().required(validationKeys.events.event.endAt.required),
  timezone: Yup.string().trim(),
  status: Yup.string().trim().required(validationKeys.events.event.status.required),
  publishAt: Yup.string().when('status', {
    is: (value) => value === 'scheduled',
    then: (schema) => schema.required(validationKeys.events.event.publishAt.required),
    otherwise: (schema) => schema.notRequired()
  })
});
