import { isSupportedAction } from '@acq/platform-registry';
import { domainError } from '@acq/engine-domain';

// Capability guard (TZ §9.1): an action is valid for a platform ONLY if its
// capability descriptor declares it in `supportedActions`. Rejecting an
// unsupported actionType UP-FRONT — at account.action (targeted) and
// campaign.create (mass) — avoids fanning out tasks that could only fail on the
// device, and returns ONE clear coded error instead of a late per-task
// ACTION_METHOD_UNSUPPORTED. Single source of truth for both entry points (no
// duplication). Verify-by-fact still applies afterwards on the device.
export function assertSupportedAction(platform, actionType) {
  if (!isSupportedAction(platform, actionType)) {
    throw domainError(
      'ACTION_NOT_SUPPORTED',
      `platform ${platform} does not support action '${actionType}'`
    );
  }
}
