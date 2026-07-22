/**
 * Account-generation ports (TZ §4/§7):
 * @typedef {Object} AccountGenerator
 * @property {(input: { platform: string, count: number, deviceId: string }) => Promise<Object[]>} generate
 * @typedef {Object} VerificationResourceProvider
 * @property {(input: { country: string, service: string }) => Promise<{ numberId: string, msisdn: string }>} rentNumber
 * @property {(numberId: string) => Promise<string>} pollSms
 * @property {(numberId: string) => Promise<void>} releaseNumber
 * @property {() => Promise<{ email: string, secretRef: string }>} provisionEmail
 * @property {(email: string) => Promise<string>} pollEmailCode
 * @typedef {Object} PersonaGenerator
 * @property {(input: { platform: string, niche?: string, locale?: string }) => Promise<Object>} generate
 */
export { generatePersona, personaKey } from './persona.js';
export { createAccountGenerator } from './generator.js';
export { createVerificationResourceProvider } from './verification-provider.js';
