import { OPERATIONS } from '@acq/control';

// A2A (agent-to-agent) surface (TZ §11.3) — publishes an agent card advertising
// every facade operation as a skill, and accepts tasks that route through the
// SAME facade (RBAC + validation + audit). One definition, exposed as A2A skills
// alongside MCP/REST — zero business logic here. Thin presentation.
export function buildAgentCard({ baseUrl = '' } = {}) {
  return {
    name: 'acq',
    description: 'Universal account & device lifecycle platform — buy/generate accounts, provision devices, run campaigns, scrape.',
    version: '0.1.0',
    url: baseUrl ? `${baseUrl}/a2a` : '/a2a',
    capabilities: { streaming: false },
    skills: OPERATIONS.map((op) => ({
      id: op.name,
      name: op.name,
      description: `${op.mutating ? '[mutating] ' : '[read] '}${op.name}`,
      tags: [op.mutating ? 'mutating' : 'read', ...op.roles]
    }))
  };
}

// Handle an A2A task. Accepts either { skill|operation, args } directly or a
// message envelope { message: { parts: [{ data: { operation, args } }] } }.
export function handleA2aTask(facade, { role = 'brain', actor = 'a2a' } = {}) {
  return async (task = {}) => {
    const part = task.message?.parts?.find((p) => p.data)?.data ?? {};
    const operation = task.skill ?? task.operation ?? part.operation ?? part.skill;
    const args = task.args ?? part.args ?? {};
    if (!operation) {
      return { status: { state: 'failed' }, error: { code: 'USAGE', message: 'skill/operation is required' } };
    }
    const envelope = await facade.execute(operation, { role, actor, args, correlationId: task.id });
    if (envelope.error) {
      return { id: task.id ?? null, status: { state: 'failed' }, error: envelope.error };
    }
    return { id: task.id ?? null, status: { state: 'completed' }, artifacts: [{ parts: [{ data: envelope.data }] }] };
  };
}
