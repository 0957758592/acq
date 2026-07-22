import { transition, assignToDevice, domainError } from '@acq/engine-domain';

import { toDomainAccount } from '../handlers/map.js';

// Shared account-lifecycle application service (TZ §3.1/§11). ONE place that
// loads a persisted account, walks the generic 8-state machine (or reassigns a
// device) under optimistic locking, and persists it — reused by the control
// facade's account.* operations across ALL surfaces (MCP/REST/CLI/SSE/webhooks)
// so no surface re-implements the load->transition->save dance.
async function loadAccount(ctx, accountId) {
  const [doc] = await ctx.accountRepo.find({ _id: accountId });
  if (!doc) throw domainError('ACCOUNT_NOT_FOUND', `account ${accountId} not found`);
  return toDomainAccount(doc);
}

export async function applyAccountTransition(ctx, { accountId, to }) {
  const clock = () => ctx.clock.now();
  const account = transition(await loadAccount(ctx, accountId), to, { clock });
  await ctx.accountRepo.save(account);
  return { accountId, status: to };
}

export async function reassignAccount(ctx, { accountId, deviceId }) {
  const account = assignToDevice(await loadAccount(ctx, accountId), deviceId);
  await ctx.accountRepo.save(account);
  return { accountId, assignedDeviceId: deviceId };
}
