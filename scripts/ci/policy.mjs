// AI assistance: OpenAI Codex, 2026-11-09. Scope: approved CI selection/gate policy. Review: Reviewed and approved by @ron on 2026-11-09.
export const JOBS = [
  'frontend_quality', 'supplier_quality', 'user_build', 'order_quality', 'credit_quality',
  'supplier_integration', 'supplier_ui_e2e', 'order_messaging', 'credit_messaging',
  'user_messaging', 'order_credit_integration',
];

const affected = {
  'frontend/': ['frontend_quality', 'supplier_ui_e2e'],
  'user-service/': ['user_build', 'supplier_integration', 'supplier_ui_e2e', 'user_messaging', 'order_credit_integration'],
  'supplier-service/': ['supplier_quality', 'supplier_integration', 'supplier_ui_e2e', 'order_credit_integration'],
  'order-service/': ['order_quality', 'supplier_ui_e2e', 'order_messaging', 'order_credit_integration'],
  'credit-service/': ['credit_quality', 'supplier_ui_e2e', 'credit_messaging', 'user_messaging', 'order_credit_integration'],
};

export function selectJobs(paths) {
  const selected = new Set();
  for (const path of paths) {
    if (path.endsWith('.md') || path === 'LICENSE') continue;
    const prefix = Object.keys(affected).find(prefix => path.startsWith(prefix));
    if (prefix) for (const job of affected[prefix]) selected.add(job);
    else return [...JOBS];
  }
  return JOBS.filter(job => selected.has(job));
}

export function checkResults(selected, needs) {
  if (!Array.isArray(selected) || selected.some(job => !JOBS.includes(job)) || new Set(selected).size !== selected.length) {
    throw new Error('Invalid CI selection plan');
  }
  const errors = [];
  if (needs.changes?.result !== 'success') errors.push('Change detection did not succeed');
  for (const job of JOBS) {
    const result = needs[job]?.result;
    if (selected.includes(job) ? result !== 'success' : !['success', 'skipped'].includes(result)) {
      errors.push(`${job}: ${result ?? 'missing'}`);
    }
  }
  return errors;
}
