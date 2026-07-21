import { domainError } from '../errors.js';

// Generalized account state machine (TZ §3.1) — superset of the WhatsApp
// vertical (whose 'purchased' == our 'acquired') and the TikTok engine (which
// adds 'checkpointed'). Exactly 8 states. `logged_out` is a PROBE RESULT, not a
// state: it maps to online -> bringing_online (re-login), never a 9th state.
export const ACCOUNT_STATES = [
  'acquired',
  'assigned',
  'bringing_online',
  'online',
  'cooldown',
  'checkpointed',
  'banned',
  'retired'
];

const TRANSITIONS = {
  acquired: ['assigned', 'retired'],
  assigned: ['bringing_online', 'acquired', 'retired'],
  bringing_online: ['online', 'cooldown', 'checkpointed', 'assigned', 'banned', 'retired'],
  online: ['bringing_online', 'cooldown', 'checkpointed', 'banned', 'retired'],
  cooldown: ['online', 'bringing_online', 'banned', 'retired'],
  checkpointed: ['bringing_online', 'banned', 'retired'],
  banned: ['retired'],
  retired: []
};

export function canTransition(from, to) {
  return Boolean(TRANSITIONS[from]) && TRANSITIONS[from].includes(to);
}

export function assertTransition(from, to) {
  if (!canTransition(from, to)) {
    throw domainError('ACCOUNT_TRANSITION_INVALID', `Illegal account transition ${from} -> ${to}`);
  }
}
