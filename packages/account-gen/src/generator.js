import { domainError } from '@acq/engine-domain';

// On-device account generation flow (TZ §7.1). Orchestrates persona -> signup
// (injected on-device flow) -> AcquiredAccount{source:'generate'}. Deterministic
// steps; a captcha is a hard verify-by-fact stop (never guessed). The signup fn
// abstracts the platform driver + verification-code polling so this stays pure
// and testable.
export function createAccountGenerator({ signup, personaGenerator } = {}) {
  if (typeof signup !== 'function') throw new Error('createAccountGenerator requires a signup function');

  return {
    async generate({ platform, deviceId, count = 1, niche, locale }) {
      const accounts = [];
      for (let seed = 0; seed < count; seed += 1) {
        const persona = personaGenerator.generate({ platform, niche, locale, seed });
        const result = await signup({ platform, deviceId, persona });

        if (result?.captcha) {
          throw domainError('GEN_CAPTCHA_ENCOUNTERED', `captcha during ${platform} signup`);
        }
        if (!result?.identifier || !result?.secretRefs) {
          throw domainError('GEN_VERIFICATION_FAILED', `signup did not complete for ${platform}`);
        }

        accounts.push({
          platform,
          source: 'generate',
          identifier: result.identifier,
          secretRefs: result.secretRefs,
          personaRef: persona.personaKey,
          acquisition: { acquiredAt: null, generatedOnDeviceId: deviceId }
        });
      }
      return accounts;
    }
  };
}
