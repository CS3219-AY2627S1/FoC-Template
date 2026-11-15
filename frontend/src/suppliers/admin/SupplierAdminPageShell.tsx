/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-6), date: 2026-09-27
 * Scope: Extracted the shared Supplier administrator page shell for issue #34.
 * Author review: Reviewed and approved by @ron.
 */
import { TopBar } from '../../components/TopBar'

export function SupplierAdminPageShell({ children }: { readonly children: React.ReactNode }) {
  return (
    <>
      <TopBar />
      <main className="mx-auto max-w-5xl px-4 py-6 sm:py-10">{children}</main>
    </>
  )
}
