// MongoReportRepo — persistence port for whatsapp_report_campaigns + _tasks.
//
// Exactly-once contract: upsertTask() is idempotent on the unique triple
//   (campaignId, accountId, targetMsisdn) — a duplicate is a no-op via
//   $setOnInsert. doneKeys() reuses the domain reportTaskKey so its key
//   format never drifts from the reconciler.
import { reportTaskKey } from '@acq/whatsapp';
import { WhatsappReportCampaign } from '../models/whatsapp-report-campaign.model.js';
import { WhatsappReportTask } from '../models/whatsapp-report-task.model.js';

export function createMongoReportRepo({
  campaignModel = WhatsappReportCampaign,
  taskModel = WhatsappReportTask
} = {}) {
  return {
    async findCampaign(id) { return campaignModel.findById(id).lean(); },
    async listActiveCampaigns() { return campaignModel.find({ status: 'active' }).lean(); },
    async doneKeys(campaignId) {
      const tasks = await taskModel.find({ campaignId, status: 'done' }).lean();
      return new Set(tasks.map((t) => reportTaskKey({
        campaignId: t.campaignId, accountId: t.accountId, targetMsisdn: t.targetMsisdn
      })));
    },
    async createCampaign({ targets, strategy }) {
      return campaignModel.create({ targets, strategy, status: 'active' });
    },
    async setCampaignStatus(id, status) {
      return campaignModel.findByIdAndUpdate(id, { $set: { status } }, { new: true }).lean();
    },
    async upsertTask({ campaignId, accountId, targetMsisdn }) {
      return taskModel.findOneAndUpdate(
        { campaignId, accountId, targetMsisdn },
        { $setOnInsert: { campaignId, accountId, targetMsisdn, status: 'pending' } },
        { upsert: true, new: true }
      );
    },
    async hasOpenTasks(campaignId) {
      return Boolean(await taskModel.exists({ campaignId, status: { $ne: 'done' } }));
    },
    async markTask(id, status, error = '') {
      return taskModel.findOneAndUpdate(
        { _id: id },
        { $set: { status, lastError: error }, $inc: { attempts: 1 } },
        { new: true }
      );
    }
  };
}
