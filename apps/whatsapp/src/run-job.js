import { EngineJobRun } from '@acq/core/models/engine-job-run';
import { systemClock } from '@acq/whatsapp-infra';

const MAX_BACKOFF_MS = 15 * 60 * 1000;
const BASE_BACKOFF_MS = 30 * 1000;

// Pure Date computation (REQUIREM-compliant: no setTimeout/setInterval).
// Backoff: min(15min, 30s * 2^(attempts-1)).
export function nextRetryDate(attempts, clock = systemClock) {
  const delay = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** (attempts - 1));
  return new Date(clock.now().getTime() + delay);
}

// DLQ-compatible ledger wrapper. Re-throws on failure so consumeJsonWithDlq reacts:
//  - transient (attempts < maxAttempts): plain re-throw -> consumer nack-drops -> Mongo retry cron re-delivers.
//  - terminal  (attempts >= maxAttempts): re-throw tagged { permanent, attempts, maxAttempts } -> DLQ.
export async function runJob(
  payload,
  handler,
  { model = EngineJobRun, clock = systemClock, workerId = 'whatsapp' } = {}
) {
  const jobRun = await model.findById(payload.jobRunId);
  if (!jobRun) return null; // nothing to run
  if (jobRun.status === 'succeeded' || jobRun.status === 'cancelled') return jobRun; // idempotent short-circuit

  jobRun.status = 'running';
  jobRun.attempts = (jobRun.attempts || 0) + 1;
  jobRun.startedAt = clock.now();
  jobRun.workerId = workerId;
  await jobRun.save();

  try {
    const result = await handler(payload, jobRun);
    jobRun.status = 'succeeded';
    jobRun.result = result ?? {};
    jobRun.completedAt = clock.now();
    await jobRun.save();
    return jobRun;
  } catch (error) {
    const exhausted = jobRun.attempts >= jobRun.maxAttempts;
    jobRun.status = exhausted ? 'failed' : 'queued';
    jobRun.nextRetryAt = exhausted ? null : nextRetryDate(jobRun.attempts, clock);
    jobRun.lastError = {
      code: error?.code || '',
      message: error?.message || '',
      stack: error?.stack || ''
    };
    await jobRun.save();
    if (exhausted) {
      error.permanent = true;
      error.attempts = jobRun.attempts;
      error.maxAttempts = jobRun.maxAttempts;
    }
    throw error;
  }
}
