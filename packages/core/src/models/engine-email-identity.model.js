import mongoose from 'mongoose';

// Email identities used to register at shops (TZ §6.3/§6.4). These are mailboxes
// the OPERATOR owns and supplies — the platform stores the address + IMAP
// coordinates and a SECRET REF for the password (never the password itself), so
// shop signup/confirmation can read the verification code over IMAP.
// Provider-agnostic: gmail, outlook, yahoo, custom IMAP — anything reachable.
const engineEmailIdentitySchema = new mongoose.Schema(
  {
    tenantId: { type: String, trim: true, default: 'default', index: true },
    address: { type: String, trim: true, required: true },
    provider: { type: String, trim: true, default: 'custom' },
    imapHost: { type: String, trim: true, default: '' },
    imapPort: { type: Number, default: 993 },
    // Refs only (vault:/env:) — resolved at use time by the SecretResolver.
    secretRefs: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    status: { type: String, enum: ['active', 'disabled'], default: 'active', index: true },
    notes: { type: String, trim: true, default: '' }
  },
  { collection: 'engine_email_identities', timestamps: true }
);

engineEmailIdentitySchema.index({ tenantId: 1, address: 1 }, { unique: true });

export const EngineEmailIdentity =
  mongoose.models.EngineEmailIdentity || mongoose.model('EngineEmailIdentity', engineEmailIdentitySchema);
