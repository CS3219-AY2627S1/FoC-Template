/*
AI Assistance Disclosure:
Tool: ChatGPT (model: GPT-5.6 Sol High), date: 2026-09-19
Scope: Added the profile route
Author review: I reviewed correctness and edited the changes to fit the project

Tool: ChatGPT (model: GPT-5.6 Sol High), date: 2026-09-21
Scope: Added the admin manager portal route
Author review: I reviewed correctness and edited the changes to fit the project

Tool: ChatGPT (model: GPT-5.6 Sol High), date: 2026-10-27
Scope: Added the credit audit-log route
Author review: I reviewed correctness and edited the changes to fit the project
*/

export const routes = {
  signIn: '/',
  signUp: '/sign-up',
  home: '/home',
  profile: '/profile',
  orderAuditLogs: '/order-audit-logs/:orderId/history',
  creditAuditLogs: '/credit-audit-logs',
  adminManagerPortal: '/admin-manager-portal',
  suppliers: '/suppliers',
  orders: '/orders',
  orderOperations: '/admin/orders',
} as const
