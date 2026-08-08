/** @type {import('jest').Config} */
// Web workspace tests the PURE logic (typed API client, formatting) via ts-jest.
// React component/E2E rendering is out of scope here; type-safety is enforced by
// `tsc --noEmit` (npm run typecheck) and the Next build.
module.exports = {
  displayName: 'web',
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: { module: 'commonjs', moduleResolution: 'node', isolatedModules: true, esModuleInterop: true, strict: true } }]
  }
};
