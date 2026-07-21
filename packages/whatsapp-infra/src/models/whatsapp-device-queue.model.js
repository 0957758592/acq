import mongoose from 'mongoose';

const queueSchema = new mongoose.Schema({
  deviceId:         { type: mongoose.Schema.Types.ObjectId, ref: 'EngineDevice', required: true, unique: true, index: true },
  activeSlots:      { type: Number, default: 1 },
  targetDepth:      { type: Number, default: 3 },
  activeAccountIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
  waitingAccountIds:{ type: [mongoose.Schema.Types.ObjectId], default: [] },
  version:          { type: Number, default: 0 }
}, { collection: 'whatsapp_device_queues', timestamps: true });

export const WhatsappDeviceQueue =
  mongoose.models.WhatsappDeviceQueue || mongoose.model('WhatsappDeviceQueue', queueSchema);
