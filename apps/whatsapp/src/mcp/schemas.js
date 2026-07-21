// Yup argument schemas for the MCP tools + a validateArgs() gate.
//
// Every schema uses .noUnknown() and validateArgs runs with stripUnknown:false, so
// unexpected fields are REJECTED (not silently dropped). On failure we throw a coded
// domain error (MCP_ARGS_INVALID) which mcp/errors.js maps to ErrorCode.InvalidParams.
import * as Yup from 'yup';
import { REPORT_STRATEGIES, domainError } from '@acq/whatsapp';
import { flattenValidationErrors } from '@acq/validation';

const string = () => Yup.string().trim();

export const poolBuySchema = Yup.object({
  quantity: Yup.number().integer().min(1).required()
}).noUnknown();

export const deviceEnrollSchema = Yup.object({
  deviceId: string().required(),
  targetDepth: Yup.number().integer().min(1).required()
}).noUnknown();

export const deviceQueueGetSchema = Yup.object({
  deviceId: string().required()
}).noUnknown();

export const campaignCreateSchema = Yup.object({
  targets: Yup.array().of(string().required()).min(1).required(),
  strategy: string().oneOf(REPORT_STRATEGIES).required()
}).noUnknown();

export const campaignIdSchema = Yup.object({
  id: string().required()
}).noUnknown();

export const accountRetireSchema = Yup.object({
  id: string().required()
}).noUnknown();

export const emptySchema = Yup.object({}).noUnknown();

// Validate + reject unknown fields; throw MCP_ARGS_INVALID on any failure.
// yup aggregates every message on ValidationError.errors (string[]) when abortEarly
// is false — flattenValidationErrors turns that string[] into a readable list.
export async function validateArgs(schema, input) {
  try {
    return await schema.validate(input ?? {}, { abortEarly: false, stripUnknown: false });
  } catch (err) {
    const messages = flattenValidationErrors(
      Array.isArray(err?.errors) && err.errors.length ? err.errors : err?.message
    );
    const detail = messages.length ? messages.join('; ') : String(err?.message || 'invalid arguments');
    throw domainError('MCP_ARGS_INVALID', detail);
  }
}
