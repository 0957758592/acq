import * as Yup from 'yup';

import { validationKeys } from '../keys.js';

const availabilityWindowSchema = Yup.object({
  startMinutes: Yup.number().required(validationKeys.booking.availability.startMinutes.required),
  endMinutes: Yup.number().required(validationKeys.booking.availability.endMinutes.required)
});

const weeklyRuleSchema = Yup.object({
  dayOfWeek: Yup.number().required(validationKeys.booking.availability.dayOfWeek.required),
  startMinutes: Yup.number().required(validationKeys.booking.availability.startMinutes.required),
  endMinutes: Yup.number().required(validationKeys.booking.availability.endMinutes.required)
});

const dateOverrideSchema = Yup.object({
  date: Yup.string().required(validationKeys.booking.availability.date.required),
  isClosed: Yup.boolean(),
  windows: Yup.array().of(availabilityWindowSchema)
});

export const bookingServiceSchema = Yup.object({
  name: Yup.string().trim().required(validationKeys.booking.service.name.required),
  slug: Yup.string().trim().required(validationKeys.booking.service.slug.required),
  description: Yup.string().trim(),
  active: Yup.boolean(),
  timezone: Yup.string().trim(),
  durationMinutes: Yup.number().min(5),
  stepMinutes: Yup.number().min(5),
  bufferMinutes: Yup.number().min(0),
  minimumNoticeMinutes: Yup.number().min(0),
  bookingWindowDays: Yup.number().min(1),
  priceCents: Yup.number().min(0),
  currency: Yup.string().trim(),
  requiresPayment: Yup.boolean()
});

export const bookingAvailabilitySchema = Yup.object({
  serviceId: Yup.string().trim().required(validationKeys.booking.availability.serviceId.required),
  timezone: Yup.string().trim(),
  weeklyRules: Yup.array().of(weeklyRuleSchema),
  dateOverrides: Yup.array().of(dateOverrideSchema),
  blackoutDates: Yup.array().of(Yup.string().trim())
});

export const bookingRequestSchema = Yup.object({
  serviceId: Yup.string().trim().required(validationKeys.booking.booking.serviceId.required),
  startAt: Yup.string().trim().required(validationKeys.booking.booking.startAt.required),
  endAt: Yup.string().trim().required(validationKeys.booking.booking.endAt.required),
  customerName: Yup.string().trim().required(validationKeys.booking.booking.customerName.required),
  customerEmail: Yup.string()
    .trim()
    .email(validationKeys.booking.booking.customerEmail.invalid)
    .required(validationKeys.booking.booking.customerEmail.required),
  notes: Yup.string().trim()
});

