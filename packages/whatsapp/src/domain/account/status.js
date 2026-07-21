import { domainError } from '../errors.js';

export const ACCOUNT_STATUSES = [
  'purchased', 'assigned', 'bringing_online',
  'online', 'cooldown', 'banned', 'retired'
];

const TRANSITIONS = {
  purchased: ['assigned', 'retired'],
  assigned: ['bringing_online', 'purchased', 'retired'],
  bringing_online: ['online', 'cooldown', 'assigned', 'banned', 'retired'],
  online: ['cooldown', 'banned', 'retired'],
  cooldown: ['online', 'banned', 'retired'],
  banned: ['retired'],
  retired: []
};

export function canTransition(from, to) {
  return Boolean(TRANSITIONS[from]) && TRANSITIONS[from].includes(to);
}

export function assertTransition(from, to) {
  if (!canTransition(from, to)) {
    throw domainError(
      'ACCOUNT_TRANSITION_INVALID',
      `Illegal account transition ${from} -> ${to}`
    );
  }
}
