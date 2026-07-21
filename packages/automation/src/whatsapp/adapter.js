import { bringWhatsappOnline, checkWhatsappState, reportTarget } from './ui-flows.js';

const STATUS_BY_STATE = {
  logged_in: 'active',
  banned: 'banned',
  logged_out: 'cooldown',
  unknown: 'cooldown'
};

export const whatsappAdapter = {
  platform: 'whatsapp',

  // login = bring a purchased account online (session import). Currently a guarded
  // seam (throws WHATSAPP_SESSION_IMPORT_UNVERIFIED) until the Plan-3 delivery
  // format + a real session artifact are known.
  login(controller, account, opts = {}) {
    return bringWhatsappOnline(controller, { sessionRef: account?.secretRefs?.session, ...opts });
  },

  async healthCheck(controller) {
    const state = await checkWhatsappState(controller);
    return {
      success: state === 'logged_in',
      status: STATUS_BY_STATE[state] || 'cooldown',
      state,
      reason: state
    };
  },

  report(controller, target = {}) {
    return reportTarget(controller, { targetMsisdn: target.targetMsisdn, alsoBlock: target.alsoBlock });
  }
};
