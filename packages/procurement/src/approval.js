// Policy-based ApprovalPort (TZ §6.3). A declarative ShopAdapterSpec is executed
// only after approval; unknown kinds fail closed (manual approval required).
export function createPolicyApprovalPort({ autoApproveKinds = [], approver = 'policy' } = {}) {
  const allow = new Set(autoApproveKinds);
  return {
    async requestApproval(kind, _payload) {
      if (allow.has(kind)) return { approved: true, approvedBy: approver };
      return { approved: false, reason: 'manual-approval-required' };
    }
  };
}
