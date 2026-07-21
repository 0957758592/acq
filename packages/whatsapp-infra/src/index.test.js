import * as infra from './index.js';

describe('@acq/whatsapp-infra public surface', () => {
  it('re-exports every adapter, repo, and model factory', () => {
    for (const name of [
      'conflictError', 'notFoundError',
      'WhatsappAccount', 'WhatsappDeviceQueue', 'WhatsappReportCampaign', 'WhatsappReportTask',
      'createMongoAccountRepo', 'createMongoDeviceQueueRepo', 'createMongoReportRepo',
      'consumeJsonWithDlq', 'createRabbitJobDispatcher', 'createRabbitRedisEventBus',
      'createKeychainEnvSecretResolver',
      'createDarkShoppingProcurementAdapter', 'createExpenseRecorder',
      'createDuoplusDeviceRegistrationAdapter', 'createWhatsappAutomationAdapter'
    ]) {
      expect(typeof infra[name]).toBe('function');
    }
    expect(typeof infra.systemClock).toBe('object');
    expect(typeof infra.bareClock).toBe('function');
    expect(Array.isArray(infra.ACCOUNT_STATUSES)).toBe(true);
  });
});
