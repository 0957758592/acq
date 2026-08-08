// Domain types mirroring the control-plane read-models the UI consumes. Kept in
// one place (single source of truth for the typed client + features).

export interface Target {
  _id?: string;
  platform: string;
  targetType: string;
  identifier: string;
  source: string;
  status: string;
  score: number | null;
  tags: string[];
  metadata: Record<string, unknown>;
}

export interface TargetListResult {
  items: Target[];
  nextCursor: string | null;
}

export interface TelemetryOutcomes {
  ok: number;
  partial: number;
  failed: number;
}

export interface TelemetrySummary {
  platform: string | null;
  outputMax: boolean;
  events: number;
  outcomes: TelemetryOutcomes;
  totals: Record<string, number>;
  focus: Record<string, number>;
  outputScore: number;
  errorRate: number;
}

export interface CommentResult {
  comment: string;
  target: { platform: string; targetType: string; identifier: string };
  model: string | null;
}
