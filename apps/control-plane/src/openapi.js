import { OPERATIONS } from '@acq/control';

import { SCHEMAS } from './validators.js';

// Contract-first OpenAPI 3.1 document (REQUIREM §2.1) GENERATED from the single
// source of truth: the OPERATIONS catalog (names, RBAC roles, mutating flag) +
// the per-operation yup validators (field types + required + reject-unknown).
// Generated — never hand-maintained — so the published contract can never drift
// from what the facade actually accepts.
const YUP_TO_JSON = { string: 'string', number: 'number', boolean: 'boolean', object: 'object', array: 'array', date: 'string' };

function schemaFor(operation) {
  const yupSchema = SCHEMAS[operation];
  if (!yupSchema) return { type: 'object', additionalProperties: false };
  const described = yupSchema.describe();
  const properties = {};
  const required = [];
  for (const [field, meta] of Object.entries(described.fields ?? {})) {
    const type = YUP_TO_JSON[meta.type] ?? 'string';
    properties[field] = type === 'array' ? { type, items: { type: 'string' } } : { type };
    if (meta.optional === false) required.push(field);
  }
  const schema = { type: 'object', properties, additionalProperties: false };
  if (required.length) schema.required = required;
  return schema;
}

export function buildOpenApiSpec({ baseUrl = '', version = '1.0.0' } = {}) {
  const paths = {
    '/health': {
      get: {
        summary: 'Liveness probe (unauthenticated)',
        security: [],
        responses: { 200: { description: 'service is up', content: { 'application/json': { schema: { type: 'object', properties: { status: { type: 'string' }, service: { type: 'string' } } } } } } }
      }
    },
    '/metrics': {
      get: {
        summary: 'Prometheus metrics (facade ops, errors, latency)',
        security: [],
        responses: { 200: { description: 'Prometheus text exposition', content: { 'text/plain': { schema: { type: 'string' } } } } }
      }
    }
  };

  for (const op of OPERATIONS) {
    paths[`/v1/op/${op.name}`] = {
      post: {
        operationId: op.name.replace(/[.]/g, '_'),
        summary: `Execute the ${op.name} facade operation`,
        tags: [op.name.split('.')[0]],
        'x-roles': op.roles,
        'x-mutating': Boolean(op.mutating),
        requestBody: { required: true, content: { 'application/json': { schema: schemaFor(op.name) } } },
        responses: {
          200: { description: 'facade envelope (data on success, coded error otherwise)', content: { 'application/json': { schema: { $ref: '#/components/schemas/Envelope' } } } },
          401: { description: 'missing or invalid bearer token' },
          403: { description: 'role may not call this operation' }
        }
      }
    };
  }

  return {
    openapi: '3.1.0',
    info: {
      title: '@acq control plane',
      version,
      description: 'Single command facade over every management surface. One operation per path; the same catalog backs MCP, gRPC, WebSocket, GraphQL, A2A and the CLI.'
    },
    servers: [{ url: baseUrl }],
    security: [{ bearerAuth: [] }],
    components: {
      securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', description: 'Role-carrying bearer token (readonly | operator | brain | admin)' } },
      schemas: {
        Envelope: {
          type: 'object',
          properties: {
            data: { description: 'operation result (null on error)' },
            error: { type: ['object', 'null'], properties: { code: { type: 'string' }, message: { type: 'string' } } },
            meta: { type: 'object', properties: { operation: { type: 'string' }, correlationId: { type: ['string', 'null'] } } }
          }
        }
      }
    },
    paths
  };
}
