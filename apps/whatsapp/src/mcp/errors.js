// Maps handler errors → McpError WITHOUT leaking stack/internal detail.
//
// Domain errors carry a safe, coded message (`CODE: message`), so we map them by
// code and preserve their message. Everything else (unexpected/infra errors) is
// collapsed to a generic InternalError — the original is only ever logged, never
// surfaced to the MCP client.
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { DomainError } from '@acq/whatsapp';

const CODE_MAP = {
  MSISDN_INVALID: ErrorCode.InvalidParams,
  MCP_ARGS_INVALID: ErrorCode.InvalidParams,
  NOT_FOUND: ErrorCode.InvalidParams,
  REPORT_STRATEGY_UNKNOWN: ErrorCode.InvalidParams,
  ACCOUNT_TRANSITION_INVALID: ErrorCode.InvalidRequest,
  CONFLICT: ErrorCode.InvalidRequest,
  QUEUE_FULL: ErrorCode.InvalidRequest
};

export function toMcpError(err, { logger } = {}) {
  logger?.error?.('mcp handler error', { code: err?.code, message: err?.message });
  if (err instanceof McpError) return err;
  const isDomain = err instanceof DomainError || err?.name === 'DomainError';
  if (isDomain) {
    const code = CODE_MAP[err.code] ?? ErrorCode.InvalidRequest;
    return new McpError(code, err.message);
  }
  return new McpError(ErrorCode.InternalError, 'Internal error');
}
