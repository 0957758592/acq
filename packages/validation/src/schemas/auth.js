import * as Yup from 'yup';

import { validationKeys } from '../keys.js';

export const loginSchema = Yup.object({
  email: Yup.string()
    .email(validationKeys.auth.login.email.invalid)
    .required(validationKeys.auth.login.email.required),
  password: Yup.string()
    .min(6, validationKeys.auth.login.password.min)
    .required(validationKeys.auth.login.password.required)
});






