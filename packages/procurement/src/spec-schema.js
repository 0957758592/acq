import * as yup from 'yup';

import { domainError } from '@acq/engine-domain';

// Supported shop authentication kinds (TZ §6.4).
export const AUTH_KINDS = ['api-key', 'bearer', 'cookie-session', 'oauth2', 'login-password'];

const endpointSchema = yup
  .object({
    method: yup.string().oneOf(['GET', 'POST', 'PUT', 'DELETE']).required(),
    path: yup.string().required(),
    responseMap: yup.object().default({}),
    bodyTemplate: yup.object().optional(),
    deliveryFormat: yup.object().optional()
  })
  .noUnknown(true);

const shopSpecSchema = yup
  .object({
    shopId: yup.string().required(),
    baseUrl: yup.string().required(),
    title: yup.string().default(''),
    auth: yup
      .object({
        kind: yup.string().oneOf(AUTH_KINDS).required(),
        config: yup.object().default({})
      })
      .noUnknown(true)
      .required(),
    endpoints: yup
      .object({
        balance: endpointSchema.required(),
        offers: endpointSchema.required(),
        purchase: endpointSchema.required(),
        delivery: endpointSchema.required()
      })
      .noUnknown(true)
      .required(),
    rateLimit: yup.object().optional(),
    verified: yup.boolean().default(false)
  })
  .noUnknown(true);

// Deterministic validation of a declarative ShopAdapterSpec (TZ §6.2/§6.3
// VALIDATE step). Rejects unknown fields; throws a single coded error on any
// violation.
export function validateShopSpec(spec) {
  try {
    return shopSpecSchema.validateSync(spec, { abortEarly: false, stripUnknown: false });
  } catch (err) {
    throw domainError('SHOP_SPEC_INVALID', (err.errors || [err.message]).join('; '));
  }
}
