import * as Yup from 'yup';

import { validationKeys } from './keys.js';

export function makeYupLocale({ t } = {}) {
  const translate = typeof t === 'function' ? t : (k) => k;

  // Keep these generic; schema-level overrides can provide more specific keys.
  return {
    mixed: {
      required: () => translate(validationKeys.common.required)
    },
    string: {
      email: () => translate(validationKeys.common.email),
      min: ({ min }) => translate(validationKeys.common.min, { min })
    }
  };
}

export function initValidation({ t } = {}) {
  Yup.setLocale(makeYupLocale({ t }));
}






