/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-11-10
 * Scope: Implementation, refactoring, and test assistance for the recorded frontend work.
 */
import { Link } from 'react-router'

export function UnauthorizedPage() {
  return <main className="grid min-h-screen place-items-center bg-slate-50 px-4 text-center">
    <div>
      <h1 className="text-3xl font-semibold text-slate-950">Administrator access required</h1>
      <p className="mt-3 text-sm text-slate-600">You do not have permission to view this page.</p>
      <Link to="/" className="mt-6 inline-flex rounded-lg bg-slate-900 px-4 py-3 text-sm font-medium text-white">Back to home</Link>
    </div>
  </main>
}
