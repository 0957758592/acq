import { ApiClient } from './client';
import { Target, TargetListResult, TelemetrySummary, CommentResult } from './types';

// Typed operation wrappers over the generic client — one method per facade op the
// UI uses, so features get compile-time-checked args/results instead of stringly
// calls. Add a line here when the UI adopts a new op.
export function ops(api: ApiClient) {
  return {
    listTargets: (args: { platform?: string; targetType?: string; status?: string; minScore?: number; tag?: string; limit?: number; cursor?: string } = {}) =>
      api.execute<TargetListResult>('target.list', args),
    scoreTarget: (args: { id?: string; platform?: string; targetType?: string; identifier?: string; features?: Record<string, unknown> }) =>
      api.execute<{ score: number; target: Target }>('target.score', args),
    telemetrySummary: (args: { platform?: string; kind?: string; since?: string } = {}) =>
      api.execute<TelemetrySummary>('telemetry.summary', args),
    generateComment: (args: { id?: string; platform?: string; targetType?: string; identifier?: string; target?: Record<string, unknown>; tone?: string; locale?: string }) =>
      api.execute<CommentResult>('content.comment', args)
  };
}
