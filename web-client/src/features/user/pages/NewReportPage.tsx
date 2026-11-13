import { useEffect, useRef, useState } from 'react'
import type { SubmitEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useName } from '@/api/user/member'
import { useCreateReport } from '@/api/user/reports'
import { EmptyState } from '@/components/EmptyState'
import { FormError } from '@/components/FormError'
import { Page } from '@/components/Page'
import { SubmitButton } from '@/components/SubmitButton'
import { TextAreaField } from '@/components/TextAreaField'
import { fieldErrorsOf } from '@/lib/http'

// The services phrase field errors as "has already been reported by you".
function sentence(messages: string[]): string {
  return messages.map((message) => message.charAt(0).toUpperCase() + message.slice(1)).join('. ')
}

// F1.6.3. The errand view links here as /reports/new?errand=<id>&account=<the other person's id>,
// so the two features connect through the URL only.
export function NewReportPage() {
  const [searchParams] = useSearchParams()
  const errandId = searchParams.get('errand') ?? ''
  const reportedId = searchParams.get('account') ?? ''
  const [reason, setReason] = useState('')
  const create = useCreateReport()
  const name = useName(reportedId, reportedId !== '')
  const fieldErrors = fieldErrorsOf(create.error)
  const sentRef = useRef<HTMLHeadingElement>(null)

  // The form, and the button that had focus, are gone once the report is sent.
  useEffect(() => {
    if (create.isSuccess) sentRef.current?.focus()
  }, [create.isSuccess])

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    create.mutate({ reportedId, errandId, reason })
  }

  if (!errandId || !reportedId) {
    return (
      <Page title="Report a problem">
        <EmptyState
          title="Open this page from an errand"
          description="A report names the errand and the other person on it."
          action={
            <Link to="/errands" className="ds-btn ds-btn--glass">
              Go to errands
            </Link>
          }
        />
      </Page>
    )
  }

  return (
    <Page title="Report a problem">
      <div className="grid max-w-xl grid-cols-1 gap-4">
        {create.isSuccess ? (
          <section aria-labelledby="report-sent" className="ds-surface grid grid-cols-1 gap-3 p-5">
            <h2 id="report-sent" ref={sentRef} tabIndex={-1}>
              Report sent
            </h2>
            <p className="text-muted">An administrator reads every report and decides what happens.</p>
            <Link to={`/errands/${errandId}`} className="ds-btn ds-btn--glass justify-self-start">
              Back to the errand
            </Link>
          </section>
        ) : (
          <form noValidate onSubmit={handleSubmit} className="ds-surface grid grid-cols-1 gap-4 p-5">
            <p className="text-muted">Tell the administrators what went wrong. They read every report and decide what happens.</p>
            <FormError error={create.error} fields={['reason', 'errandId', 'reportedId']} />
            {/* Not editable: both come from the errand. Refusals about them show here, not as field names. */}
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="min-w-0">
                <dt className="ds-label">Errand</dt>
                <dd className="mt-1 nums-tabular wrap-anywhere">#{errandId}</dd>
                {fieldErrors.errandId && <dd className="ds-field-error">{sentence(fieldErrors.errandId)}</dd>}
              </div>
              <div className="min-w-0">
                <dt className="ds-label">Reported</dt>
                <dd className="mt-1 wrap-anywhere">{name.data ?? 'The other person on this errand'}</dd>
                {fieldErrors.reportedId && <dd className="ds-field-error">{sentence(fieldErrors.reportedId)}</dd>}
              </div>
            </dl>
            <TextAreaField
              label="What happened?"
              name="reason"
              value={reason}
              onChange={setReason}
              hint="Between 20 and 500 characters"
              characterLimit={500}
              errors={fieldErrors.reason}
            />
            <SubmitButton pending={create.isPending} pendingLabel="Sending…">
              Send report
            </SubmitButton>
          </form>
        )}
      </div>
    </Page>
  )
}
