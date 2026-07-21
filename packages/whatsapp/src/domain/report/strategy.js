import { domainError } from '../errors.js';

export const REPORT_STRATEGIES = [
  'all-accounts-report-each-target',
  'one-target-per-account'
];

export function reportTaskKey({ campaignId, accountId, targetMsisdn }) {
  return `${campaignId}:${accountId}:${targetMsisdn}`;
}

function crossProduct(campaign, accountIds) {
  const tasks = [];
  for (const accountId of accountIds) {
    for (const targetMsisdn of campaign.targets) {
      tasks.push({ campaignId: campaign.id, accountId, targetMsisdn });
    }
  }
  return tasks;
}

function roundRobin(campaign, accountIds) {
  return accountIds.map((accountId, index) => ({
    campaignId: campaign.id,
    accountId,
    targetMsisdn: campaign.targets[index % campaign.targets.length]
  }));
}

export function expandReportTasks({ campaign, onlineAccountIds, doneKeys = new Set() }) {
  let tasks;
  if (campaign.strategy === 'all-accounts-report-each-target') {
    tasks = crossProduct(campaign, onlineAccountIds);
  } else if (campaign.strategy === 'one-target-per-account') {
    tasks = roundRobin(campaign, onlineAccountIds);
  } else {
    throw domainError('REPORT_STRATEGY_UNKNOWN', `Unknown strategy ${campaign.strategy}`);
  }
  return tasks.filter((task) => !doneKeys.has(reportTaskKey(task)));
}
