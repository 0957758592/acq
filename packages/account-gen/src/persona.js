import { createHash } from 'node:crypto';

// Deterministic persona assembly (TZ §7.4). The AI layer may enrich this
// offline, but a persona derived from (niche, locale, seed) is reproducible so
// the same identity can be re-created and audited — no nondeterminism in the
// domain. A persona stays consistent across signup, setupProfile and actions.
const FIRST_NAMES = {
  en: ['Alex', 'Jordan', 'Taylor', 'Casey', 'Morgan', 'Riley', 'Jamie', 'Avery'],
  ru: ['Alexey', 'Dmitry', 'Ivan', 'Sergey', 'Anna', 'Maria', 'Olga', 'Nikita']
};
const LAST_NAMES = {
  en: ['Reed', 'Parker', 'Quinn', 'Hayes', 'Brooks', 'Cole', 'Ellis', 'Shaw'],
  ru: ['Petrov', 'Ivanov', 'Sidorov', 'Volkov', 'Smirnov', 'Kozlov', 'Popov', 'Orlov']
};

function pick(pool, seed) {
  return pool[((seed % pool.length) + pool.length) % pool.length];
}

export function personaKey(persona) {
  const material = `${persona.displayName}|${persona.nicheKey}|${persona.locale}`;
  return createHash('sha256').update(material).digest('hex').slice(0, 16);
}

export function generatePersona({ niche = 'general', locale = 'en', seed = 0 } = {}) {
  const pool = FIRST_NAMES[locale] ? locale : 'en';
  const nicheKey = String(niche).trim().toLowerCase();
  const first = pick(FIRST_NAMES[pool], seed);
  const last = pick(LAST_NAMES[pool], seed + 3);
  const displayName = `${first} ${last}`;
  const persona = {
    displayName,
    bio: `${first} — ${nicheKey} enthusiast. Sharing ${nicheKey} content daily.`,
    nicheKey,
    locale: pool,
    interests: [nicheKey],
    avatarRef: null,
    behaviorProfileRef: null
  };
  return { ...persona, personaKey: personaKey(persona) };
}
