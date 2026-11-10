/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-11-10
 * Scope: Audit log page: every entry with its hash and link, and a "Verify chain" button
 *        that checks the chain only when pressed (author's decision).
 * Author review: Reviewed and approved by @t-leongchuan
 */
import { useState } from 'react'
import { verifyAuditChain } from '../api/adminApi'
import { AdminShell } from './AdminShell'
import { AuditEntriesList } from './AuditEntriesList'
import { shortHash } from './format'
import { errorText } from './errors'
import type { ChainCheck } from './types'

export function AuditLogPage() {
  const [check, setCheck] = useState<{ busy: boolean; result: ChainCheck | null; error: unknown }>({ busy: false, result: null, error: null })

  async function verify() {
    setCheck({ busy: true, result: null, error: null })
    try {
      setCheck({ busy: false, result: await verifyAuditChain(), error: null })
    } catch (error) {
      setCheck({ busy: false, result: null, error })
    }
  }

  return <AdminShell title="Audit log" intro="Every role change, suspension and restore, newest first. Each entry's hash is computed from its contents and the hash of the entry before it, so editing or deleting an old entry breaks the chain.">
    <section aria-label="Chain check" className="mt-6 flex flex-wrap items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5">
      <button type="button" onClick={verify} disabled={check.busy} className="min-h-11 rounded-lg bg-navy-800 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-700 disabled:opacity-50">
        {check.busy ? 'Checking…' : 'Verify chain'}
      </button>
      <div aria-live="polite" className="min-w-0 text-sm">
        {check.result?.valid === true && <p className="font-semibold text-emerald-800">
          ✓ Chain valid: {check.result.checkedEntries} {check.result.checkedEntries === 1 ? 'entry' : 'entries'} checked
          {check.result.latestHash && <span className="ml-1 font-mono text-xs font-normal text-slate-500">(latest {shortHash(check.result.latestHash)})</span>}
        </p>}
        {check.result?.valid === false && <p role="alert" className="font-semibold text-red-700">
          ✗ Chain broken at entry #{check.result.firstInvalidId} ({check.result.checkedEntries} entries checked)
        </p>}
        {check.error !== null && <p role="alert" className="text-red-700">{errorText(check.error)}</p>}
        {!check.result && check.error === null && !check.busy && <p className="text-slate-500">Recomputes every hash and checks each link.</p>}
      </div>
    </section>
    <section className="mt-6" aria-label="Audit entries list">
      <AuditEntriesList query={{}} pageSize={50} />
    </section>
  </AdminShell>
}
