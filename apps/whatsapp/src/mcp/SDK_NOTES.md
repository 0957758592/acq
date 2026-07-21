# `@modelcontextprotocol/sdk` — API notes (Plan 6 contract)

Discovery notes for the MCP surface of `@julio/whatsapp-app`. Every symbol / import
path below was verified against the **installed** package, not docs. Later tasks
(`errors.js`, `schemas.js`, `tools.js`, `resources.js`, `notifications.js`,
`core.js`, `stdio.js`, `streamable-http.js`) build against this file.

## Installed version

- `@modelcontextprotocol/sdk` **1.29.0** (`^1.29.0` in `package.json`).
- Runtime: Node 20, ESM (`"type": "module"`). The SDK is ESM-first (`dist/esm`).
- `yup ^1.4.0` also added (matches `@julio/validation`) — used by our own schema
  layer (`schemas.js`), NOT by the SDK. See "Validation: yup vs zod" below.

### Getting the version at runtime
`require('@modelcontextprotocol/sdk/package.json').version` returns **`undefined`**.
The package's `exports` map does NOT expose `./package.json`; the `"./*"` fallback
rewrites it to `dist/esm/package.json`, which is only `{"type":"module"}`. If you
ever need the version at runtime, read it from our own `package.json`, not the SDK's.

## Import subpaths (all verified to import cleanly)

The `exports` map routes `@modelcontextprotocol/sdk/<x>` → `dist/esm/<x>` via a
`"./*"` wildcard. Import the `.js` subpaths directly (ESM):

| Import specifier | Exports |
| --- | --- |
| `@modelcontextprotocol/sdk/server/index.js` | `Server` (low-level, **@deprecated** in favor of McpServer) |
| `@modelcontextprotocol/sdk/server/mcp.js` | `McpServer`, `ResourceTemplate` (high-level) |
| `@modelcontextprotocol/sdk/server/stdio.js` | `StdioServerTransport` |
| `@modelcontextprotocol/sdk/server/streamableHttp.js` | `StreamableHTTPServerTransport` (note camel-case `streamableHttp`) |
| `@modelcontextprotocol/sdk/types.js` | all request/result schemas, `McpError`, `ErrorCode`, type guards |

There is also `@modelcontextprotocol/sdk/server/sse.js` (legacy SSE transport) and
`.../server/webStandardStreamableHttp.js` (Web-standard Request/Response, for
Workers/Deno/Bun) — we want the Node one (`streamableHttp.js`).

## Validation: yup vs zod (READ THIS)

- The SDK depends on **zod** (`^3.25 || ^4.0`) — it is both a hard `dependency` and a
  non-optional `peerDependency`. `zod@4.4.3` was pulled in transitively and resolves
  fine; low-level `server/index.js` and `types.js` import without us adding zod.
  (yarn classic prints a peer-dep warning for zod; it is harmless — zod is installed.)
- The **high-level `McpServer.tool()/registerTool()` expects zod** for `inputSchema`/
  `outputSchema` (a `ZodRawShape` or a zod schema). yup does NOT plug into that API.
- **Recommendation: use the low-level `Server` + `setRequestHandler` approach.** With
  it WE own argument validation, so we validate `tools/call` arguments with **yup**
  (`schemas.js`) inside the handler, and hand-author the JSON Schema we advertise in
  `tools/list`. This keeps schema authorship consistent with `@julio/validation` (yup)
  and avoids adding a second schema library to our own code. The `@deprecated` tag on
  `Server` is Anthropic steering casual users to the sugar API; the low-level API is
  fully supported and is what `McpServer` is built on top of.

## Low-level `Server` (recommended)

```js
import { Server } from '@modelcontextprotocol/sdk/server/index.js';

const server = new Server(
  { name: 'julio-whatsapp', version: '0.1.0' },   // Implementation (name+version required)
  { capabilities: { tools: {}, resources: {} } }, // ServerOptions: advertise what we support
);
```

- Constructor: `new Server(serverInfo: {name, version}, options?: ServerOptions)`.
- `ServerOptions.capabilities` (`ServerCapabilities`) MUST advertise the features you
  handle, e.g. `{ tools: {}, resources: {} }` (add `{ resources: { subscribe: true } }`
  if we support resource subscribe/updated notifications, `{ logging: {} }` for
  `sendLoggingMessage`). Capabilities can only be set before `connect`; also
  `server.registerCapabilities(caps)` merges more in before connecting.
- `serverInfo` is the `Implementation` returned to the client on `initialize`.

### Registering request handlers
`Server` extends `Protocol`. Register handlers by **request schema** (from `types.js`):

```js
import {
  ListToolsRequestSchema, CallToolRequestSchema,
  ListResourcesRequestSchema, ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

server.setRequestHandler(ListToolsRequestSchema, async (request, extra) => ({ tools: [...] }));
server.setRequestHandler(CallToolRequestSchema, async (request, extra) => ({ content: [...] }));
```

- Signature: `setRequestHandler(schema, handler)` where
  `handler(request, extra) => Result | Promise<Result>`.
- `request` is parsed against the schema. For `CallToolRequestSchema`,
  `request.params = { name: string, arguments?: object, _meta? }`. For
  `ReadResourceRequestSchema`, `request.params = { uri: string }`.
- `extra` is `RequestHandlerExtra`: `{ signal, sessionId?, requestId, _meta?,
  authInfo?, sendNotification(n), sendRequest(req, schema, opts), requestInfo? }`.
  Use `extra.sendNotification(...)` to emit a notification correlated to this request.
- One handler per method; re-registering replaces. `removeRequestHandler(method)` exists.

### Result shapes (verified schema names in `types.js`)
- `tools/list` → `ListToolsResult`: `{ tools: Tool[] }`. Each **`Tool`** is
  `{ name, description?, inputSchema, outputSchema?, annotations? }` where
  **`inputSchema` is a plain JSON Schema object** of shape
  `{ type: "object", properties?: {...}, required?: string[] }` (NOT a yup/zod object).
  → author these JSON Schemas by hand (or derive them) in `schemas.js`/`tools.js`.
- `tools/call` → `CallToolResult`: `{ content: ContentBlock[], isError?: boolean,
  structuredContent?: object }`. Simplest content block is
  `{ type: "text", text: "..." }` (`TextContentSchema`). Set `isError: true` for
  tool-level failures you want the model to see (vs protocol errors — see McpError).
- `resources/list` → `ListResourcesResult`: `{ resources: Resource[] }`
  (`Resource` = `{ uri, name, description?, mimeType?, ... }`).
- `resources/read` → `ReadResourceResult`: `{ contents: [{ uri, mimeType?, text? }
  | { uri, mimeType?, blob? }] }`.

### Connecting a transport
```js
await server.connect(transport); // starts the transport and begins listening
```
- `connect(transport): Promise<void>` (inherited from `Protocol`). The server takes
  ownership of the transport. `await server.close()` to shut down.
- Lifecycle callbacks (set before connect): `server.onclose`, `server.onerror`,
  `server.oninitialized`.

## High-level `McpServer` (alternative — NOT recommended for us, see above)

```js
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
const mcp = new McpServer({ name, version }, options);
await mcp.connect(transport);
```
- `new McpServer(serverInfo, options?)` — same args as `Server`.
- `mcp.registerTool(name, { title?, description?, inputSchema?, outputSchema?,
  annotations?, _meta? }, cb)` — `inputSchema`/`outputSchema` are **zod** (`ZodRawShape`
  or zod schema). `cb(args, extra) => CallToolResult`. (Older `mcp.tool(...)` overloads
  are `@deprecated`.)
- `mcp.registerResource(name, uriOrTemplate, config, readCallback)` — static URI string
  or a `ResourceTemplate`. `readCallback(uri: URL, extra) => ReadResourceResult`.
  (`mcp.resource(...)` overloads are `@deprecated`.)
- `mcp.registerPrompt(...)` for prompts (not needed by our plan).
- Escape hatch: `mcp.server` exposes the underlying `Server` for
  `setRequestHandler`/notifications. `mcp.connect`, `mcp.close`, `mcp.isConnected()`,
  `mcp.sendToolListChanged()`, `mcp.sendResourceListChanged()`.
- Reason we skip it: its tool/resource validation is zod-based; our schema stack is yup.

## Transports

### stdio — `StdioServerTransport`
```js
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
const transport = new StdioServerTransport(); // optional (stdin?, stdout?) Readable/Writable
await server.connect(transport);              // connect() calls transport.start() for you
```
- `new StdioServerTransport(stdin?: Readable, stdout?: Writable)` — defaults to
  `process.stdin`/`process.stdout`. Use for the `stdio.js` entrypoint.
- IMPORTANT: on stdio, stdout is the JSON-RPC channel — do NOT write logs to stdout;
  send logs to stderr (or via `server.sendLoggingMessage`).

### Streamable HTTP — `StreamableHTTPServerTransport`
```js
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { randomUUID } from 'node:crypto';

// stateful (session per client):
const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID() });
// stateless: new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
await server.connect(transport);
```
- `new StreamableHTTPServerTransport(options?: StreamableHTTPServerTransportOptions)`.
  Key option: `sessionIdGenerator: (() => string) | undefined`
  (stateful vs stateless). Other options: `onsessioninitialized`, `eventStore`
  (for resumable SSE), `enableJsonResponse`, etc. (from
  `WebStandardStreamableHTTPServerTransportOptions`).
- It does NOT open its own port. Wire it into a Node HTTP server / Express route:
  ```js
  app.post('/mcp', (req, res) => transport.handleRequest(req, res, req.body));
  app.get('/mcp',  (req, res) => transport.handleRequest(req, res));
  ```
  `handleRequest(req: IncomingMessage, res: ServerResponse, parsedBody?)`. Handles both
  POST (client→server messages) and GET (server→client SSE stream).
- `transport.sessionId` getter; `transport.close()`.
- For stateful mode you typically keep one `Server`+transport pair per session id.

## Errors — `McpError` / `ErrorCode`

```js
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
throw new McpError(ErrorCode.InvalidParams, 'phone is required', { field: 'phone' });
```
- `class McpError extends Error { readonly code: number; readonly data?: unknown;
  constructor(code, message, data?) }` plus static `McpError.fromError(code, message, data?)`.
- Throwing an `McpError` from a request handler is turned into a JSON-RPC error
  response by the protocol layer. (For tool *business* failures the model should see,
  prefer returning `{ content: [...], isError: true }` from `tools/call` instead.)
- **`ErrorCode` enum (verified numeric values):**
  | Name | Code |
  | --- | --- |
  | `ParseError` | -32700 |
  | `InvalidRequest` | -32600 |
  | `MethodNotFound` | -32601 |
  | `InvalidParams` | -32602 |
  | `InternalError` | -32603 |
  | `ConnectionClosed` | -32000 |
  | `RequestTimeout` | -32001 |
  | `UrlElicitationRequired` | -32042 |

  Our `errors.js` (T2) should map domain errors → these codes: validation →
  `InvalidParams`, unknown tool/resource → `MethodNotFound` (or handle unknown-tool as
  `isError` content), unexpected → `InternalError`.

## Notifications

Low-level (`Server`) — inherited from `Protocol`:
- Generic: `server.notification(notification, options?)` where `notification =
  { method, params? }` and `options?: { relatedRequestId?, relatedTask? }`.
- Convenience helpers on `Server`:
  - `server.sendToolListChanged()` → `notifications/tools/list_changed`
  - `server.sendResourceListChanged()` → `notifications/resources/list_changed`
  - `server.sendResourceUpdated({ uri })` → `notifications/resources/updated`
  - `server.sendPromptListChanged()`
  - `server.sendLoggingMessage(params, sessionId?)` → `notifications/message`
    (requires `logging` capability advertised).
- Request-scoped: inside a handler use `extra.sendNotification(n)` so the notification
  is correlated to the in-flight request (matters for streamable-http SSE routing).
- To advertise list-changed support, set the matching capability, e.g.
  `{ tools: { listChanged: true }, resources: { listChanged: true, subscribe: true } }`.
- Notification schemas exist in `types.js`
  (`ToolListChangedNotificationSchema`, `ResourceListChangedNotificationSchema`,
  `ResourceUpdatedNotificationSchema`, `LoggingMessageNotificationSchema`, `ProgressNotificationSchema`, ...).

## Request-handler schema symbols (all in `types.js`, all verified present)

`ListToolsRequestSchema`, `CallToolRequestSchema`, `ListResourcesRequestSchema`,
`ReadResourceRequestSchema`, `ListResourceTemplatesRequestSchema`,
`SubscribeRequestSchema`, `UnsubscribeRequestSchema`, `ListPromptsRequestSchema`,
`GetPromptRequestSchema`, `SetLevelRequestSchema`, `PingRequestSchema`,
`InitializeRequestSchema`, `CompleteRequestSchema`.
Result schemas (for reference/typing): `CallToolResultSchema`, `ListToolsResultSchema`,
`ReadResourceResultSchema`, `ListResourcesResultSchema`, `TextContentSchema`, `ToolSchema`.
Guards: `isInitializeRequest`, `isInitializedNotification`, `isJSONRPCRequest`,
`isJSONRPCNotification`.

## Summary recommendation for Plan 6

Build `core.js` on the **low-level `Server`** from `server/index.js`:
`new Server({name,version},{capabilities})`, register `ListTools`/`CallTool`/
`ListResources`/`ReadResource` handlers via `setRequestHandler(<Schema>, handler)`,
validate `tools/call` arguments with **yup** (`schemas.js`), advertise hand-authored
JSON-Schema `inputSchema` in `tools/list`, throw `McpError(ErrorCode.*, ...)` for
protocol errors and return `{ isError: true }` content for tool-level failures. Expose
it over stdio (`StdioServerTransport`) and Streamable HTTP
(`StreamableHTTPServerTransport` + a Node/Express route calling `handleRequest`) — both
attached with `await server.connect(transport)`.
