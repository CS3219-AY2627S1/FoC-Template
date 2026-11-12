/*
 * AI Assistance Disclosure
 * Tool and date: OpenAI Codex (gpt-5.6-sol), 2026-10-17
 * Scope (AI-18): Built and tested the requested errand creation preview and entry points.
 * Tool and date: OpenAI Codex (gpt-5.6-sol), 2026-10-23
 * Scope (AI-21): Displayed the real balance in the UI and tested its display.
 * Usage log: AI_USAGE_LOG.md
 * Author review: Changes validated and confirmed.
 */

import { FormField } from '../ui/FormField'

type CreditOfferCardProps = {
  availableCredits: number | null
  balanceError?: string | null
  balanceLoading?: boolean
  onRetryBalance?: () => void
  error?: string
  value: string
  onChange: (value: string) => void
}

export function CreditOfferCard({
  availableCredits,
  balanceError,
  balanceLoading = false,
  onRetryBalance,
  error,
  value,
  onChange,
}: CreditOfferCardProps) {
  return (
    <section className="rounded-[18px] border border-[#dde3de] bg-white p-5 shadow-[0_8px_24px_rgba(22,59,42,0.07)]">
      <div className="mb-3.5 flex items-center justify-between gap-4">
        <h2 className="text-base font-medium text-[#17211d]">Credit offer</h2>
        <span className="text-xs text-[#68736c]" aria-live="polite">
          {availableCredits === null ? '— available' : `${availableCredits} available`}
        </span>
      </div>

      <FormField htmlFor="credit-value" label="Credits" error={error} required>
        <input
          id="credit-value"
          name="creditValue"
          type="number"
          inputMode="numeric"
          min="1"
          max={availableCredits ?? undefined}
          step="1"
          value={value}
          disabled={availableCredits === null}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'credit-value-error' : 'credit-value-description'}
          className="h-11 w-full rounded-lg border border-[#dde3de] bg-white px-3 text-center text-xl font-semibold text-[#0d3c2d] outline-none transition focus:border-[#175c45] focus:ring-4 focus:ring-[#175c45]/10 aria-invalid:border-[#d92d20] aria-invalid:ring-[#d92d20]/10 disabled:cursor-not-allowed disabled:bg-[#f5f7f4] disabled:text-[#929c95]"
        />
      </FormField>

      {balanceLoading ? (
        <p className="mt-3 text-xs text-[#68736c]" role="status">Loading your balance…</p>
      ) : balanceError ? (
        <div className="mt-3 text-xs text-red-700" role="alert">
          <span>{balanceError}</span>{' '}
          <button
            type="button"
            onClick={onRetryBalance}
            className="cursor-pointer font-semibold underline underline-offset-2"
          >
            Retry
          </button>
        </div>
      ) : null}

      <p id="credit-value-description" className="mt-3 text-xs leading-[1.4] text-[#68736c]">
        {value || '0'} credits will be reserved when the errand is created and transferred only
        after you confirm delivery.
      </p>
    </section>
  )
}
