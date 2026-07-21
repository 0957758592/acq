import mongoose from 'mongoose';

const expenseSchema = new mongoose.Schema(
  {
    category: { type: String, trim: true, required: true, index: true },
    provider: { type: String, trim: true, default: '' },
    amountCents: { type: Number, required: true },
    currency: { type: String, trim: true, default: 'USD' },
    description: { type: String, trim: true, default: '' },
    accountId: { type: mongoose.Schema.Types.ObjectId, ref: 'EngineAccount', default: null, index: true },
    deviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'EngineDevice', default: null, index: true },
    externalReference: { type: String, trim: true, default: '', index: true },
    incurredAt: { type: Date, default: Date.now, index: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: () => ({}) }
  },
  { collection: 'engine_expenses', timestamps: true }
);

const djekxaOrderSchema = new mongoose.Schema(
  {
    externalOrderId: { type: String, trim: true, required: true },
    platform: { type: String, enum: ['tiktok', 'instagram', 'youtube'], required: true, index: true },
    status: { type: String, trim: true, default: 'created', index: true },
    username: { type: String, trim: true, default: '' },
    password: { type: String, trim: true, default: '' },
    email: { type: String, trim: true, lowercase: true, default: '' },
    emailPassword: { type: String, trim: true, default: '' },
    priceRub: { type: Number, default: 0 },
    priceUsdCents: { type: Number, default: 0 },
    importedAccountId: { type: mongoose.Schema.Types.ObjectId, ref: 'EngineAccount', default: null },
    orderedAt: { type: Date, default: Date.now },
    metadata: { type: mongoose.Schema.Types.Mixed, default: () => ({}) }
  },
  { collection: 'engine_djekxa_orders', timestamps: true }
);

expenseSchema.index({ category: 1, incurredAt: -1 });
djekxaOrderSchema.index({ externalOrderId: 1 }, { unique: true });

export const EngineExpense =
  mongoose.models.EngineExpense || mongoose.model('EngineExpense', expenseSchema);
export const EngineDjekxaOrder =
  mongoose.models.EngineDjekxaOrder || mongoose.model('EngineDjekxaOrder', djekxaOrderSchema);
