import * as Yup from 'yup';

import { validationKeys } from '../keys.js';

export const contactInquirySchema = Yup.object({
  name: Yup.string().trim().required(validationKeys.contact.inquiry.name.required),
  email: Yup.string()
    .trim()
    .email(validationKeys.contact.inquiry.email.invalid)
    .required(validationKeys.contact.inquiry.email.required),
  subject: Yup.string().trim().required(validationKeys.contact.inquiry.subject.required),
  message: Yup.string().trim().required(validationKeys.contact.inquiry.message.required),
  status: Yup.string().trim().required(validationKeys.contact.inquiry.status.required),
  internalNotes: Yup.string().trim()
});
