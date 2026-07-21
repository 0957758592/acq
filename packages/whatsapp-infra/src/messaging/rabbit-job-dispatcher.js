import { dispatchEngineJob } from '@acq/core/services/job-dispatch';

export function createRabbitJobDispatcher({ dispatch = dispatchEngineJob } = {}) {
  return {
    async dispatch(queueName, job, opts = {}) {
      return dispatch({
        queueName,
        jobName: job.jobName,
        targetType: job.targetType ?? '',
        targetId: job.targetId ?? null,
        payload: job.payload ?? {},
        maxAttempts: opts.maxAttempts ?? 3,
        idempotencyKey: opts.idempotencyKey ?? ''
      });
    }
  };
}
