import * as Yup from 'yup';

import { validationKeys } from '../keys.js';

export const profileSchema = Yup.object({
  name: Yup.string().trim(),
  email: Yup.string()
    .email(validationKeys.settings.profile.email.invalid)
    .required(validationKeys.settings.profile.email.required),
  avatarUrl: Yup.string()
    .trim()
    .url(validationKeys.settings.profile.avatarUrl.invalid)
    .nullable()
    .transform((value) => (value == null || value === '' ? null : value))
});

export const passwordChangeSchema = Yup.object({
  currentPassword: Yup.string().required(validationKeys.settings.password.currentPassword.required),
  newPassword: Yup.string()
    .min(6, validationKeys.settings.password.newPassword.min)
    .required(validationKeys.settings.password.newPassword.required),
  confirmPassword: Yup.string()
    .oneOf([Yup.ref('newPassword')], validationKeys.settings.password.confirmPassword.match)
    .required(validationKeys.settings.password.confirmPassword.required)
});


