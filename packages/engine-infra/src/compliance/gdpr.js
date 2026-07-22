// GDPR right-to-delete (TZ §14.7). Cascade-erases an account and every record
// derived from it (action tasks, proxy assignment), and records the erasure in
// the immutable audit trail. Models injected; optional ones are skipped safely.
export function createGdprService({ accountModel, actionTaskModel, proxyAssignmentModel = null, audit = null } = {}) {
  if (!accountModel) throw new Error('createGdprService requires an account model');

  return {
    async deleteAccount(accountId, { tenantId = 'default', actor = null } = {}) {
      const scope = { _id: accountId, tenantId };
      const account = await accountModel.deleteOne(scope);
      const actionTasks = actionTaskModel
        ? await actionTaskModel.deleteMany({ accountId, tenantId })
        : { deletedCount: 0 };
      const proxyAssignment = proxyAssignmentModel
        ? await proxyAssignmentModel.deleteMany({ accountId, tenantId })
        : { deletedCount: 0 };

      const deleted = {
        account: account.deletedCount ?? 0,
        actionTasks: actionTasks.deletedCount ?? 0,
        proxyAssignment: proxyAssignment.deletedCount ?? 0
      };

      if (audit?.record) {
        await audit.record({ operation: 'gdpr.deleteAccount', subjectId: accountId, tenantId, actor, deleted });
      }
      return { deleted };
    }
  };
}
