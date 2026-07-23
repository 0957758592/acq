import { fileURLToPath } from 'node:url';
import path from 'node:path';

import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';

// gRPC control surface (TZ §11.4) — one generic Execute RPC over the SINGLE
// facade. Args/results are JSON strings (contract = OPERATIONS catalog). Auth via
// the `authorization` metadata (bearer); role resolved by the injected
// authenticate. Thin presentation only. The Execute handler is exported for
// unit tests (no socket needed).
const PROTO_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), 'control.proto');

export function loadControlProto() {
  const def = protoLoader.loadSync(PROTO_PATH, { keepCase: true, longs: String, enums: String, defaults: true, oneofs: true });
  return grpc.loadPackageDefinition(def).acq;
}

// Pure Execute implementation — parses the request, routes through the facade,
// serializes the envelope. Reused by the gRPC method binding + tests.
export function makeExecuteHandler({ facade, authenticate, tokens = {}, defaultRole = 'brain' }) {
  return async function execute(call, callback) {
    try {
      const md = call.metadata?.get?.('authorization')?.[0];
      const auth = authenticate ? authenticate(md, { tokens }) : { role: defaultRole };
      if (authenticate && !auth) {
        return callback(null, { data_json: '', error_json: JSON.stringify({ code: 'UNAUTHORIZED', message: 'unauthorized' }) });
      }
      const { operation, args_json } = call.request;
      let args = {};
      try { args = args_json ? JSON.parse(args_json) : {}; } catch {
        return callback(null, { data_json: '', error_json: JSON.stringify({ code: 'BAD_JSON', message: 'args_json must be JSON' }) });
      }
      const envelope = await facade.execute(operation, { role: auth?.role ?? defaultRole, actor: auth?.actor, args });
      callback(null, {
        data_json: envelope.data != null ? JSON.stringify(envelope.data) : '',
        error_json: envelope.error ? JSON.stringify(envelope.error) : ''
      });
    } catch (err) {
      callback(null, { data_json: '', error_json: JSON.stringify({ code: 'INTERNAL', message: 'internal error' }) });
    }
  };
}

export function createGrpcServer({ facade, authenticate, tokens = {} } = {}) {
  const proto = loadControlProto();
  const server = new grpc.Server();
  server.addService(proto.Control.service, { Execute: makeExecuteHandler({ facade, authenticate, tokens }) });
  return server;
}

export function startGrpcServer(server, { port = 7550, host = '0.0.0.0' } = {}) {
  return new Promise((resolve, reject) => {
    server.bindAsync(`${host}:${port}`, grpc.ServerCredentials.createInsecure(), (err, boundPort) => {
      if (err) return reject(err);
      resolve(boundPort);
    });
  });
}
