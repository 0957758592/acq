// Deterministic scoring for accounts and campaign targets (TZ §10.5). The AI
// layer may PROPOSE features/weights offline, but the score itself is a pure,
// reproducible function — no nondeterminism in the domain (REQUIREM §0.2).
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function collect(contributions) {
  const reasons = contributions.filter((c) => c.delta !== 0);
  const raw = reasons.reduce((sum, c) => sum + c.delta, 0);
  return { score: clamp(raw, 0, 100), reasons };
}

// Account quality/health/risk: age, warmup and engagement help; ban history and
// consecutive failures hurt.
export function scoreAccount({
  ageDays = 0,
  warmupLevel = 0,
  engagementRate = 0,
  banHistory = 0,
  consecutiveFailures = 0
} = {}) {
  return collect([
    { factor: 'base', delta: 50 },
    { factor: 'age', delta: Math.min(Math.floor(ageDays / 30) * 4, 20) },
    { factor: 'warmup', delta: Math.round(warmupLevel * 20) },
    { factor: 'engagement', delta: Math.min(Math.round(engagementRate * 100), 20) },
    { factor: 'banHistory', delta: -banHistory * 20 },
    { factor: 'failures', delta: -consecutiveFailures * 10 }
  ]);
}

// Target quality for campaign selection: audience size + engagement, gated by
// reachability (a target we cannot act on is near-worthless).
export function scoreTarget({ followers = 0, engagementRate = 0, reachable = true } = {}) {
  return collect([
    { factor: 'base', delta: 30 },
    { factor: 'audience', delta: Math.min(Math.floor(followers / 10_000) * 2, 30) },
    { factor: 'engagement', delta: Math.min(Math.round(engagementRate * 100), 20) },
    { factor: 'reachable', delta: reachable ? 20 : -40 }
  ]);
}

// Cursor-friendly top-N selection by score, descending (stable for ties).
export function selectTopN(subjects = [], n = 10) {
  return [...subjects].sort((a, b) => b.score - a.score).slice(0, n);
}
