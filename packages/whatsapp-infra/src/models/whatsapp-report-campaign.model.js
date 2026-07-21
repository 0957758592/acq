import mongoose from 'mongoose';
import { REPORT_STRATEGIES } from '@acq/whatsapp';

const campaignSchema = new mongoose.Schema({
  targets:  { type: [String], default: [] },
  strategy: { type: String, enum: REPORT_STRATEGIES, required: true },
  status:   { type: String, enum: ['draft','active','paused','completed','stopped'], default: 'draft', index: true },
  counts:   { requested: { type: Number, default: 0 }, done: { type: Number, default: 0 }, failed: { type: Number, default: 0 } }
}, { collection: 'whatsapp_report_campaigns', timestamps: true });

export const WhatsappReportCampaign =
  mongoose.models.WhatsappReportCampaign || mongoose.model('WhatsappReportCampaign', campaignSchema);
