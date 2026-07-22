import { generatePersona, personaKey } from './persona.js';

describe('generatePersona (deterministic)', () => {
  test('same inputs -> identical persona (reproducible)', () => {
    const a = generatePersona({ niche: 'fitness', locale: 'en', seed: 7 });
    const b = generatePersona({ niche: 'fitness', locale: 'en', seed: 7 });
    expect(a).toEqual(b);
  });

  test('different seeds -> different display names', () => {
    const a = generatePersona({ niche: 'fitness', locale: 'en', seed: 1 });
    const b = generatePersona({ niche: 'fitness', locale: 'en', seed: 2 });
    expect(a.displayName).not.toBe(b.displayName);
  });

  test('carries the niche key and a stable personaKey', () => {
    const p = generatePersona({ niche: 'Travel', locale: 'en', seed: 3 });
    expect(p.nicheKey).toBe('travel');
    expect(p.personaKey).toBe(personaKey(p));
    expect(p.bio).toContain('travel');
  });

  test('respects the locale for name pools', () => {
    const en = generatePersona({ niche: 'x', locale: 'en', seed: 0 });
    const ru = generatePersona({ niche: 'x', locale: 'ru', seed: 0 });
    expect(en.displayName).not.toBe(ru.displayName);
  });

  test('falls back to the en pool for an unknown locale', () => {
    const p = generatePersona({ niche: 'x', locale: 'xx', seed: 0 });
    const en = generatePersona({ niche: 'x', locale: 'en', seed: 0 });
    expect(p.displayName).toBe(en.displayName);
  });
});
