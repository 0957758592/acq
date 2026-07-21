import { delay } from '@acq/device-control';

import { TIKTOK_TASK_STATUS, TIKTOK_TASK_TYPE } from './constants.js';

const TERMINAL_FAILURE_STATUSES = new Set([
  TIKTOK_TASK_STATUS.ALL_FAILED,
  TIKTOK_TASK_STATUS.PARTIAL_FAILED,
  TIKTOK_TASK_STATUS.CANCELLED,
  TIKTOK_TASK_STATUS.TIMED_OUT,
  TIKTOK_TASK_STATUS.ERROR
]);

function normalizeHashtags(hashtags = []) {
  return hashtags.map((tag) => (String(tag).startsWith('#') ? String(tag) : `#${tag}`)).join(' ');
}

function getFileTaskStatusValue(entry = {}) {
  return String(entry.status || entry.taskStatus || '').toLowerCase();
}

function flattenTaskList(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.list)) return data.list;
  if (Array.isArray(data?.pageData)) return data.pageData;
  if (Array.isArray(data?.records)) return data.records;
  return [];
}

export async function waitForFileTask(client, taskId, { attempts = 30, intervalMs = 2_000 } = {}) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const response = await client.getFileTaskStatus([taskId]);
    const entry = flattenTaskList(response.data).find((item) => String(item.taskId) === String(taskId));
    const status = getFileTaskStatusValue(entry);
    if (['completed', 'done', 'success', '3'].includes(status)) return entry || { taskId, status: 'completed' };
    if (['failed', 'error', '-1'].includes(status)) throw new Error(`VMOS file task failed: ${JSON.stringify(entry)}`);
    await delay(intervalMs);
  }
  throw new Error(`Timed out waiting for VMOS file task ${taskId}`);
}

export async function waitForTikTokTask(client, taskName, { taskType, attempts = 60, intervalMs = 5_000 } = {}) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const response = await client.listTKTasks({ page: 1, rows: 50, taskType });
    const task = flattenTaskList(response.data).find((item) => item.taskName === taskName || item.name === taskName);
    const status = Number(task?.taskStatus ?? task?.status);
    if (status === TIKTOK_TASK_STATUS.COMPLETED) return task;
    if (TERMINAL_FAILURE_STATUSES.has(status)) {
      throw new Error(`VMOS TikTok task failed: ${JSON.stringify(task)}`);
    }
    await delay(intervalMs);
  }
  throw new Error(`Timed out waiting for VMOS TikTok task ${taskName}`);
}

export async function publishTikTokVideo({
  client,
  padCode,
  videoUrl,
  caption = '',
  hashtags = [],
  coverTime = 0,
  musicId = '',
  privacy = 'public',
  taskName = `julio-tiktok-post-${Date.now()}`,
  waitForCompletion = true
} = {}) {
  if (!client) throw new Error('VMOS client is required');
  if (!padCode) throw new Error('padCode is required');
  if (!videoUrl) throw new Error('videoUrl is required');

  const fileResponse = await client.pushFileByUrl([padCode], videoUrl, {
    customizeFilePath: '/DCIM/',
    autoInstall: 0
  });
  if (fileResponse.data?.taskId) await waitForFileTask(client, fileResponse.data.taskId);

  const list = [
    {
      padCode,
      videoUrl,
      caption,
      hashtags: normalizeHashtags(hashtags),
      coverTime,
      musicId,
      privacy
    }
  ];
  await client.createTKTask(taskName, TIKTOK_TASK_TYPE.PUBLISH_VIDEO, list, 'Publish via julio engine');
  const task = waitForCompletion
    ? await waitForTikTokTask(client, taskName, { taskType: TIKTOK_TASK_TYPE.PUBLISH_VIDEO })
    : null;
  return { taskName, taskType: TIKTOK_TASK_TYPE.PUBLISH_VIDEO, task };
}

export async function warmupTikTokAccount({
  client,
  padCode,
  duration = 300,
  count = 10,
  taskName = `julio-tiktok-warmup-${Date.now()}`,
  waitForCompletion = false
} = {}) {
  if (!client) throw new Error('VMOS client is required');
  if (!padCode) throw new Error('padCode is required');
  await client.createTKTask(
    taskName,
    TIKTOK_TASK_TYPE.RANDOM_BROWSE,
    [{ padCode, duration, count }],
    'Warmup via julio engine'
  );
  const task = waitForCompletion
    ? await waitForTikTokTask(client, taskName, { taskType: TIKTOK_TASK_TYPE.RANDOM_BROWSE })
    : null;
  return { taskName, taskType: TIKTOK_TASK_TYPE.RANDOM_BROWSE, task };
}
