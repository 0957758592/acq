import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { domainError } from '@acq/whatsapp';
import { toMcpError } from './errors.js';

describe('toMcpError', () => {
  it('maps a domain CONFLICT to InvalidRequest, preserving the coded message', () => {
    const mapped = toMcpError(domainError('CONFLICT', 'x'));
    expect(mapped).toBeInstanceOf(McpError);
    expect(mapped.code).toBe(ErrorCode.InvalidRequest);
    expect(mapped.message).toContain('CONFLICT');
  });

  it('maps a domain MCP_ARGS_INVALID to InvalidParams', () => {
    const mapped = toMcpError(domainError('MCP_ARGS_INVALID', 'bad'));
    expect(mapped).toBeInstanceOf(McpError);
    expect(mapped.code).toBe(ErrorCode.InvalidParams);
  });

  it('collapses unknown errors to a generic InternalError without leaking detail, but logs the original', () => {
    const errorCalls = [];
    const logger = { error: (...args) => errorCalls.push(args) };
    const mapped = toMcpError(new Error('secret db dsn s3cr3t'), { logger });
    expect(mapped).toBeInstanceOf(McpError);
    expect(mapped.code).toBe(ErrorCode.InternalError);
    expect(mapped.message).toContain('Internal error');
    expect(mapped.message).not.toContain('secret');
    expect(mapped.message).not.toContain('s3cr3t');
    expect(errorCalls).toHaveLength(1);
    expect(JSON.stringify(errorCalls[0])).toContain('secret db dsn s3cr3t');
  });

  it('passes through an existing McpError unchanged', () => {
    const original = new McpError(ErrorCode.MethodNotFound, 'no such tool');
    expect(toMcpError(original)).toBe(original);
  });
});
