// Server-only configuration (12-factor, REQUIREM §CONFIG). The bearer token is
// read from the environment on the server and NEVER shipped to the browser — a
// token maps to a role inside the control-plane, so the UI simply authenticates
// as its configured actor. Client components reach the facade via same-origin
// /api/op/* proxy routes that attach this token server-side.
export interface ServerConfig {
  apiUrl: string;
  token: string;
}

export function serverConfig(): ServerConfig {
  return {
    apiUrl: process.env.ACQ_API_URL ?? 'http://localhost:8080',
    token: process.env.ACQ_API_TOKEN ?? ''
  };
}
