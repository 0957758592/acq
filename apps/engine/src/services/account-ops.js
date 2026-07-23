import { domainError } from '@acq/engine-domain';

import { assertSupportedAction } from './action-support.js';

// Shared account device-ops (TZ §8.7 / §11): probe an account's real on-device
// state and run a single action against its assigned device — over the generic
// automationFor(platform) bridge. Reused by the control facade's account.probe /
// account.action across every surface. Fails safe (coded) when the account is
// missing or no device provider is wired — never guesses.
async function resolve(ctx, accountId) {
  const [doc] = await ctx.accountRepo.find({ _id: accountId });
  if (!doc) throw domainError('ACCOUNT_NOT_FOUND', `account ${accountId} not found`);
  if (!ctx.automationFor) throw domainError('AUTOMATION_UNAVAILABLE', 'no device provider wired');
  const device = doc.assignedDeviceId ? await ctx.deviceModel.findById(doc.assignedDeviceId).lean() : null;
  return { doc, device, automation: ctx.automationFor(doc.platform) };
}

export async function probeAccount(ctx, { accountId }) {
  const { doc, device, automation } = await resolve(ctx, accountId);
  const state = await automation.probeState({ providerDeviceId: device?.providerDeviceId, account: doc });
  return { accountId, platform: doc.platform, state };
}

export async function runAccountAction(ctx, { accountId, actionType, target }) {
  const { doc, device, automation } = await resolve(ctx, accountId);
  // Reject an action the platform doesn't support before any device I/O.
  assertSupportedAction(doc.platform, actionType);
  const result = await automation.runAction(
    { providerDeviceId: device?.providerDeviceId, account: doc },
    { type: actionType, target }
  );
  return { accountId, actionType, target, ...result };
}
