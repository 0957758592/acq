import { createApiClient, ApiClient } from './client';
import { serverConfig } from '../config';

// Server-side client factory — binds the env-held base URL + bearer token. Used
// only from Server Components and /api/op route handlers, so the token stays on
// the server (REQUIREM §7.5).
export function serverApi(): ApiClient {
  const { apiUrl, token } = serverConfig();
  return createApiClient({ baseUrl: apiUrl, token });
}
