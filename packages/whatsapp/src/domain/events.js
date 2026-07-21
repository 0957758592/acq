export const EVENT_TYPES = [
  'account.banned', 'queue.low', 'pool.low', 'campaign.completed', 'report.done'
];

function make(type, payload, { clock }) {
  return { type, occurredAt: clock().toISOString(), payload };
}

export const accountBanned = (payload, ctx) => make('account.banned', payload, ctx);
export const queueLow = (payload, ctx) => make('queue.low', payload, ctx);
export const poolLow = (payload, ctx) => make('pool.low', payload, ctx);
export const campaignCompleted = (payload, ctx) => make('campaign.completed', payload, ctx);
export const reportDone = (payload, ctx) => make('report.done', payload, ctx);
