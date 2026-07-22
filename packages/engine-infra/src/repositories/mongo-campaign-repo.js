// Generic MongoCampaignRepo (TZ §4). Tenant-scoped campaign persistence for the
// action engine. Model injected.
export function createMongoCampaignRepo({ model, tenantId = 'default' } = {}) {
  if (!model) throw new Error('createMongoCampaignRepo requires a mongoose model');
  return {
    async createCampaign(input) {
      return model.create({ tenantId, ...input });
    },
    async findCampaign(id) {
      return model.findOne({ _id: id, tenantId }).lean();
    },
    async listActiveCampaigns(platform) {
      return model.find({ tenantId, status: 'active', ...(platform ? { platform } : {}) }).lean();
    },
    async setCampaignStatus(id, status) {
      return model.findOneAndUpdate({ _id: id, tenantId }, { $set: { status } }, { new: true }).lean();
    }
  };
}
