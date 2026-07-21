import * as Yup from 'yup';

import { validationKeys } from '../keys.js';

export const userCreateSchema = Yup.object({
  name: Yup.string().trim(),
  email: Yup.string()
    .email(validationKeys.users.email.invalid)
    .required(validationKeys.users.email.required),
  avatarUrl: Yup.string()
    .trim()
    .url(validationKeys.users.avatarUrl.invalid)
    .nullable()
    .transform((value) => (value == null || value === '' ? null : value)),
  password: Yup.string()
    .min(6, validationKeys.users.password.min)
    .required(validationKeys.users.password.required),
  role: Yup.string().required(validationKeys.users.role.required)
});

export const userUpdateSchema = Yup.object({
  name: Yup.string().trim(),
  email: Yup.string()
    .email(validationKeys.users.email.invalid)
    .required(validationKeys.users.email.required),
  avatarUrl: Yup.string()
    .trim()
    .url(validationKeys.users.avatarUrl.invalid)
    .nullable()
    .transform((value) => (value == null || value === '' ? null : value)),
  password: Yup.string()
    .min(6, validationKeys.users.password.min)
    .notRequired()
    .nullable()
    .transform((value) => (value == null || value === '' ? null : value)),
  role: Yup.string().required(validationKeys.users.role.required)
});


