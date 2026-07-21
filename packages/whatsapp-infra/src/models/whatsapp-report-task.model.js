import mongoose from 'mongoose';

const taskSchema = new mongoose.Schema({
  campaignId:   { type: mongoose.Schema.Types.ObjectId, ref: 'WhatsappReportCampaign', required: true, index: true },
  accountId:    { type: mongoose.Schema.Types.ObjectId, ref: 'WhatsappAccount', required: true },
  targetMsisdn: { type: String, required: true },
  status:       { type: String, enum: ['pending','running','done','failed'], default: 'pending', index: true },
  attempts:     { type: Number, default: 0 },
  lastError:    { type: String, default: '' }
}, { collection: 'whatsapp_report_tasks', timestamps: true });

taskSchema.index({ campaignId: 1, accountId: 1, targetMsisdn: 1 }, { unique: true });

export const WhatsappReportTask =
  mongoose.models.WhatsappReportTask || mongoose.model('WhatsappReportTask', taskSchema);
