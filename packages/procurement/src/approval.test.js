import { createPolicyApprovalPort } from './approval.js';

describe('createPolicyApprovalPort', () => {
  it('auto-approves kinds in the allow-list', async () => {
    const port = createPolicyApprovalPort({ autoApproveKinds: ['shop-spec'], approver: 'policy-bot' });
    await expect(port.requestApproval('shop-spec', { shopId: 's1' })).resolves.toEqual({
      approved: true,
      approvedBy: 'policy-bot'
    });
  });

  it('requires manual approval for other kinds (fail-closed)', async () => {
    const port = createPolicyApprovalPort({ autoApproveKinds: [] });
    const res = await port.requestApproval('shop-spec', {});
    expect(res.approved).toBe(false);
    expect(res.reason).toBe('manual-approval-required');
  });
});
