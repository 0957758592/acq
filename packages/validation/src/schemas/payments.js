import * as Yup from 'yup';

import { validationKeys } from '../keys.js';

export const checkoutSessionSchema = Yup.object({
  mode: Yup.string().trim().required(validationKeys.payments.checkout.mode.required),
  successUrl: Yup.string().trim().required(validationKeys.payments.checkout.successUrl.required),
  cancelUrl: Yup.string().trim().required(validationKeys.payments.checkout.cancelUrl.required),
  customerEmail: Yup.string().trim().email(validationKeys.payments.checkout.customerEmail.invalid),
  customerId: Yup.string().trim(),
  priceId: Yup.string().trim(),
  quantity: Yup.number().min(1),
  lineItems: Yup.array().of(
    Yup.object({
      name: Yup.string().trim().required(validationKeys.payments.checkout.lineItemName.required),
      amount: Yup.number().min(1).required(validationKeys.payments.checkout.lineItemAmount.required),
      currency: Yup.string().trim().required(validationKeys.payments.checkout.lineItemCurrency.required),
      quantity: Yup.number().min(1)
    })
  )
});

export const paymentIntentSchema = Yup.object({
  amount: Yup.number().min(1).required(validationKeys.payments.intent.amount.required),
  currency: Yup.string().trim().required(validationKeys.payments.intent.currency.required),
  customerId: Yup.string().trim(),
  description: Yup.string().trim()
});

export const subscriptionSchema = Yup.object({
  customerId: Yup.string().trim().required(validationKeys.payments.subscription.customerId.required),
  priceId: Yup.string().trim().required(validationKeys.payments.subscription.priceId.required),
  quantity: Yup.number().min(1)
});


