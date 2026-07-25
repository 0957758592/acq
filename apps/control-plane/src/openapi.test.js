import { buildOpenApiSpec } from './openapi.js';
import { OPERATIONS } from '@acq/control';

describe('buildOpenApiSpec (contract-first REST contract, REQUIREM §2.1)', () => {
  const spec = buildOpenApiSpec({ baseUrl: 'https://acq.example' });

  it('is a valid OpenAPI 3 document with bearer security and the versioned server', () => {
    expect(spec.openapi).toMatch(/^3\./);
    expect(spec.info.title).toContain('acq');
    expect(spec.servers[0].url).toBe('https://acq.example');
    expect(spec.components.securitySchemes.bearerAuth).toMatchObject({ type: 'http', scheme: 'bearer' });
  });

  it('documents EVERY facade operation as POST /v1/op/{operation}', () => {
    const paths = Object.keys(spec.paths).filter((p) => p.startsWith('/v1/op/'));
    expect(paths).toHaveLength(OPERATIONS.length);
    for (const { name } of OPERATIONS) expect(spec.paths[`/v1/op/${name}`].post).toBeTruthy();
  });

  it('derives the request schema from the operation validator (types + required)', () => {
    const body = spec.paths['/v1/op/pool.acquire'].post.requestBody.content['application/json'].schema;
    expect(body.properties.platform).toMatchObject({ type: 'string' });
    expect(body.required).toContain('platform');
    expect(body.properties.quantity).toMatchObject({ type: 'number' });
    expect(body.required).not.toContain('quantity');
    expect(body.additionalProperties).toBe(false); // validators reject unknown fields
  });

  it('every operation responds with the {data,error,meta} envelope schema', () => {
    const res = spec.paths['/v1/op/pool.status'].post.responses['200'].content['application/json'].schema;
    expect(res.$ref).toBe('#/components/schemas/Envelope');
    const env = spec.components.schemas.Envelope;
    expect(Object.keys(env.properties).sort()).toEqual(['data', 'error', 'meta']);
  });

  it('carries the RBAC roles + mutating flag per operation (least privilege is documented)', () => {
    const op = spec.paths['/v1/op/compliance.erase'].post;
    expect(op['x-roles']).toEqual(['admin']);
    expect(op['x-mutating']).toBe(true);
    expect(spec.paths['/v1/op/pool.status'].post['x-mutating']).toBe(false);
  });

  it('documents the non-facade surfaces too (health + metrics)', () => {
    expect(spec.paths['/health'].get).toBeTruthy();
    expect(spec.paths['/metrics'].get).toBeTruthy();
  });
});
