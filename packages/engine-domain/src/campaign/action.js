import { domainError } from '../errors.js';

// Generic action vocabulary (TZ §3.5). A platform's actual supported subset
// comes from PlatformCapabilities.supportedActions; report is one action type.
export const ACTION_TYPES = [
  'report', 'publish', 'warmup', 'follow', 'unfollow',
  'like', 'comment', 'join', 'leave', 'dm', 'view', 'scrape'
];

export const ACTION_STRATEGIES = [
  'all-accounts-per-target',
  'one-target-per-account',
  'n-accounts-per-target'
];

// Exactly-once key (generalizes reportTaskKey by adding target + actionType).
export function actionTaskKey({ campaignId, accountId, target, actionType }) {
  return `${campaignId}:${accountId}:${target}:${actionType}`;
}

function task(campaign, accountId, target) {
  return { campaignId: campaign.id, accountId, target, actionType: campaign.actionType };
}

function crossProduct(campaign, accountIds) {
  const tasks = [];
  for (const accountId of accountIds) {
    for (const target of campaign.targets) {
      tasks.push(task(campaign, accountId, target));
    }
  }
  return tasks;
}

function roundRobin(campaign, accountIds) {
  return accountIds.map((accountId, index) =>
    task(campaign, accountId, campaign.targets[index % campaign.targets.length])
  );
}

function nPerTarget(campaign, accountIds, n) {
  const tasks = [];
  let cursor = 0;
  for (const target of campaign.targets) {
    for (let k = 0; k < n; k += 1) {
      tasks.push(task(campaign, accountIds[cursor % accountIds.length], target));
      cursor += 1;
    }
  }
  return tasks;
}

export function expandActionTasks({ campaign, onlineAccountIds, doneKeys = new Set() }) {
  let tasks;
  if (campaign.strategy === 'all-accounts-per-target') {
    tasks = crossProduct(campaign, onlineAccountIds);
  } else if (campaign.strategy === 'one-target-per-account') {
    tasks = roundRobin(campaign, onlineAccountIds);
  } else if (campaign.strategy === 'n-accounts-per-target') {
    tasks = nPerTarget(campaign, onlineAccountIds, campaign.params?.n ?? 1);
  } else {
    throw domainError('ACTION_STRATEGY_UNKNOWN', `Unknown strategy ${campaign.strategy}`);
  }
  return tasks.filter((t) => !doneKeys.has(actionTaskKey(t)));
}
