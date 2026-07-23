import crypto from 'node:crypto';

import { env } from '@acq/core/config/env';
import { connectMongo } from '@acq/core/db/mongo';
import { EngineJobRun } from '@acq/core/models/engine-job-run';
import { connectRabbitmq, publishJson } from '@acq/core/queue/rabbitmq';

function buildIdempotencyKey({ queueName, jobName, targetType, targetId, payload }) {
  const source = JSON.stringify({ queueName, jobName, targetType, targetId, payload });
  return crypto.createHash('sha256').update(source).digest('hex');
}

export async function dispatchEngineJob({
  queueName,
  jobName,
  tenantId = 'default',
  targetType = '',
  targetId = null,
  payload = {},
  maxAttempts = 3,
  idempotencyKey = ''
} = {}) {
  if (!queueName || !jobName) throw new Error('queueName and jobName are required');
  if (!env.mongodbUri) throw new Error('Missing MONGODB_URI');
  await connectMongo(env.mongodbUri);

  const resolvedIdempotencyKey =
    idempotencyKey || buildIdempotencyKey({ queueName, jobName, targetType, targetId, payload });

  const jobRun = await EngineJobRun.findOneAndUpdate(
    { tenantId, queueName, idempotencyKey: resolvedIdempotencyKey },
    {
      $setOnInsert: {
        tenantId,
        queueName,
        jobName,
        targetType,
        targetId,
        payload,
        maxAttempts,
        status: 'queued'
      }
    },
    { new: true, upsert: true }
  );

  if (env.rabbitmqUrl) {
    await connectRabbitmq(env.rabbitmqUrl);
    await publishJson(queueName, {
      jobRunId: String(jobRun._id),
      jobName,
      targetType,
      targetId: targetId ? String(targetId) : null,
      payload
    });
  }

  return jobRun;
}
