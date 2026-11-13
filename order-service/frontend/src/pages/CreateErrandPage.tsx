import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useEffect, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { ErrandFormFields } from '../components/ErrandFormFields'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  createOrder,
  type CreateOrderInput,
  fetchOrder,
  newIdempotencyKey,
  OrderApiError,
} from '../api/orderApi'
import { fetchCampusLocations, fetchMyCredits } from '../api/sharedApi'
import { readSession } from '../auth/session'
import { credits } from '../utils/orderFormatting'
import bagIcon from '../assets/foc-bag.svg'
import {
  EMPTY,
  type Errors,
  fieldsForRepost,
  type FieldName,
  type Fields,
  validate,
  type BalanceStatus,
  creditCheck,
  RESERVATION_POLL_MS,
  RESERVATION_WAIT_MS,
  reservationOutcome,
} from '../utils/errandForm'

/** Server field names map back to the form's own (both locations report on the drop-off picker). */
function serverErrors(error: OrderApiError): Errors {
  const mapped: Errors = {}
  for (const [field, messages] of Object.entries(error.fieldErrors)) {
    const message = messages[0]
    if (!message) continue
    if (field === 'locationsDistinct') mapped.dropoffLocationId = message
    else if (field === 'pickupLocationName') mapped.pickupLocationId = message
    else if (field === 'dropoffLocationName') mapped.dropoffLocationId = message
    else if (field in EMPTY) mapped[field as FieldName] = message
  }
  if (Object.keys(mapped).length === 0) mapped.form = error.message
  return mapped
}

/** Figma "Create errand" ("Request a hand"); `?from=<id>` starts from one of the requester's errands. */
export function CreateErrandPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [fields, setFields] = useState<Fields>(EMPTY)
  const [errors, setErrors] = useState<Errors>({})
  const fromId = useSearchParams()[0].get('from')
  // Which `from` errand the form was already filled from, and how that went.
  const [copy, setCopy] = useState<{ id: string; title: string | null } | null>(
    null,
  )
  // The errand just posted while Credit decides on its reservation; the form stays until then.
  const [posted, setPosted] = useState<{ id: string; reward: number } | null>(
    null,
  )
  const [slowId, setSlowId] = useState<string | null>(null)
  // A failure message stays until the requester edits the form or posts again.
  const [dismissedId, setDismissedId] = useState<string | null>(null)
  const locations = useQuery({
    queryKey: ['campus-locations'],
    queryFn: fetchCampusLocations,
    staleTime: 300_000,
  })
  const balance = useQuery({
    queryKey: ['credits', 'me'],
    queryFn: fetchMyCredits,
  })
  const source = useQuery({
    queryKey: ['orders', fromId],
    queryFn: () => fetchOrder(fromId!),
    enabled: fromId !== null,
    retry: false,
  })

  // Fill in once, after the errand and the location list have answered. Only the requester's own
  // errand is copied, and only into fields that are still empty, so nothing typed is overwritten.
  const locationsSettled = locations.isSuccess || locations.isError
  if (fromId && copy?.id !== fromId && !source.isPending && locationsSettled) {
    const own =
      source.data && source.data.requesterId === readSession()?.userId
        ? source.data
        : null
    setCopy({ id: fromId, title: own?.title ?? null })
    if (own) {
      const repost = fieldsForRepost(own, locations.data)
      setFields((current) => {
        const merged = { ...current }
        for (const name of Object.keys(merged) as FieldName[])
          if (!merged[name]) merged[name] = repost.fields[name]
        return merged
      })
      setErrors((current) => ({ ...repost.errors, ...current }))
    }
  }
  const copied = copy !== null && copy.id === fromId && copy.title !== null
  useEffect(() => {
    if (copied) document.getElementById('field-pickupDeadline')?.focus()
  }, [copied])
  // One Idempotency-Key per errand content: posting the same fields again after an error or a lost
  // response reuses it, so the server returns the errand it may already have created instead of
  // reserving credits twice. Changed fields, or a successful post, start a new key.
  const [attempt, setAttempt] = useState<{ body: string; key: string } | null>(
    null,
  )
  const create = useMutation({
    mutationFn: ({ input, key }: { input: CreateOrderInput; key: string }) =>
      createOrder(input, key),
    onSuccess: (order) => {
      setAttempt(null)
      void queryClient.invalidateQueries({ queryKey: ['orders'] })
      setPosted({ id: order.id, reward: order.creditReward })
    },
    onError: (error) =>
      setErrors(
        error instanceof OrderApiError
          ? error.status === 403 && !error.code
            ? {
                form: 'Switch to Requester at the top of the page to post an errand.',
              }
            : serverErrors(error)
          : { form: 'Something went wrong. Please try again.' },
      ),
  })

  const reservation = useQuery({
    queryKey: ['orders', posted?.id],
    queryFn: () => fetchOrder(posted!.id),
    enabled: posted !== null && slowId === null,
    refetchInterval: (query) =>
      query.state.data && query.state.data.state !== 'PENDING_CREDIT'
        ? false
        : RESERVATION_POLL_MS,
  })
  const outcome =
    posted && reservation.data?.id === posted.id
      ? reservationOutcome(
          reservation.data.state,
          reservation.data.terminalReason,
          posted.reward,
        )
      : null
  const failure =
    outcome?.kind === 'failed' && posted?.id !== dismissedId ? outcome : null
  const waiting =
    posted !== null &&
    slowId === null &&
    outcome?.kind !== 'failed' &&
    outcome?.kind !== 'reserved'

  useEffect(() => {
    if (!waiting || !posted) return
    const timer = setTimeout(() => setSlowId(posted.id), RESERVATION_WAIT_MS)
    return () => clearTimeout(timer)
  }, [waiting, posted])

  const outcomeKind = outcome?.kind
  useEffect(() => {
    if (!posted) return
    if (outcomeKind === 'reserved') navigate(`/errands/${posted.id}`)
    else if (outcomeKind === 'failed')
      void queryClient.invalidateQueries({ queryKey: ['credits', 'me'] })
  }, [posted, outcomeKind, navigate, queryClient])

  const update = (name: FieldName) => (value: string) => {
    setFields((current) => ({ ...current, [name]: value }))
    setErrors((current) => ({ ...current, [name]: undefined, form: undefined }))
    if (posted) setDismissedId(posted.id)
  }

  const reward = Number(fields.creditReward)
  const rewardIsValid = Number.isInteger(reward) && reward > 0
  const balanceStatus: BalanceStatus = balance.isPending
    ? { kind: 'loading' }
    : balance.isError
      ? { kind: 'unavailable' }
      : balance.data === null || balance.data === undefined
        ? { kind: 'no-account' }
        : { kind: 'loaded', available: balance.data.availableBalance }
  const credit = creditCheck(balanceStatus, rewardIsValid ? reward : null)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (waiting) return
    if (posted) setDismissedId(posted.id)
    setSlowId(null)
    const found = validate(fields)
    setErrors(found)
    if (Object.keys(found).length > 0) {
      document.getElementById(`field-${Object.keys(found)[0]}`)?.focus()
      return
    }
    if (!credit.canPost) {
      const blocked =
        balanceStatus.kind === 'loaded'
          ? { creditReward: credit.message ?? undefined }
          : { form: credit.message ?? undefined }
      setErrors(blocked)
      // Other blocks keep the button disabled and are announced by the status message.
      if (balanceStatus.kind === 'loaded') {
        document.getElementById('field-creditReward')?.focus()
      }
      return
    }
    const byId = new Map(
      (locations.data ?? []).map((location) => [location.id, location]),
    )
    const input: CreateOrderInput = {
      title: fields.title.trim(),
      description: fields.description.trim(),
      pickupLocationId: fields.pickupLocationId,
      pickupLocationName: byId.get(fields.pickupLocationId)?.name ?? '',
      dropoffLocationId: fields.dropoffLocationId,
      dropoffLocationName: byId.get(fields.dropoffLocationId)?.name ?? '',
      creditReward: Number(fields.creditReward),
      pickupDeadline: new Date(fields.pickupDeadline).toISOString(),
    }
    const body = JSON.stringify(input)
    const key = attempt?.body === body ? attempt.key : newIdempotencyKey()
    setAttempt({ body, key })
    create.mutate({ input, key })
  }

  return (
    <section className="create-errand-page">
      <form
        aria-labelledby="create-heading"
        className="errand-form create-errand-form"
        noValidate
        onSubmit={submit}
      >
        <header className="create-form-heading">
          <div>
            <p className="eyebrow">Request a hand</p>
            <h1 id="create-heading">Create a campus errand</h1>
            <p>
              Share the details and a verified student already heading your way
              can accept it.
            </p>
          </div>
          <img alt="" aria-hidden="true" src={bagIcon} />
        </header>
        {fromId && copy?.id !== fromId && (
          <p className="notice notice-next" role="status">
            Copying your errand…
          </p>
        )}
        {copy?.id === fromId && (
          <p className="notice notice-next" role="status">
            {copy.title !== null
              ? `Copied from “${copy.title}”. Choose a new pickup time, then post.`
              : "We couldn't copy that errand. Fill in the details below."}
          </p>
        )}
        <fieldset className="errand-fields" disabled={waiting}>
          <ErrandFormFields
            errors={errors}
            fields={fields}
            locations={locations.data}
            locationsFailed={locations.isError}
            maxReward={balance.data?.availableBalance}
            deadlineHint={copied ? 'Choose a new pickup time.' : undefined}
            onChange={update}
            rewardHint="Set aside from your credits when you post."
          />
        </fieldset>
        {errors.form && (
          <p className="notice notice-error" role="alert">
            {errors.form}
          </p>
        )}
        {failure && (
          <p className="notice notice-error" role="alert">
            {failure.message}
            {failure.setUpCredits && (
              <>
                {' '}
                <a className="text-link" href="/credits">
                  Set up your credits
                </a>
              </>
            )}
          </p>
        )}
        {slowId && (
          <p className="notice notice-next" role="status">
            This is taking a little longer than usual. We'll post your errand as
            soon as it's ready.{' '}
            <Link className="text-link" to={`/errands/${slowId}`}>
              View errand
            </Link>
          </p>
        )}
        <section
          aria-labelledby="credits-heading"
          className="create-credit-summary"
        >
          <div>
            <p className="eyebrow">Credit check</p>
            <h2 id="credits-heading">Your credits</h2>
          </div>
          {balance.isPending && <p>Loading your balance…</p>}
          {balance.isError && <p>Your balance is unavailable right now.</p>}
          {balance.isSuccess && balance.data === null && (
            <p>Your credit account isn't set up yet.</p>
          )}
          {balance.data && (
            <>
              <div className="balance-tiles">
                <div>
                  <strong>{balance.data.availableBalance} cr</strong>
                  <span>Available</span>
                </div>
                <div>
                  <strong>{balance.data.reservedBalance} cr</strong>
                  <span>Reserved</span>
                </div>
              </div>
              <dl className="facts">
                <dt>Reserve for this errand</dt>
                <dd>{rewardIsValid ? credits(reward) : '—'}</dd>
                <dt>Available after posting</dt>
                <dd>
                  {rewardIsValid
                    ? credits(
                        Math.max(0, balance.data.availableBalance - reward),
                      )
                    : '—'}
                </dd>
              </dl>
            </>
          )}
        </section>
        {credit.message && (
          <p
            className="notice notice-warn"
            id="credit-check-message"
            role="status"
          >
            {credit.message}
            {balanceStatus.kind === 'no-account' && (
              <>
                {' '}
                <a className="text-link" href="/credits">
                  Set up your credits
                </a>
              </>
            )}
          </p>
        )}
        <div className="create-form-actions">
          <Link className="button-secondary" to="/errands/mine">
            Cancel
          </Link>
          <button
            aria-describedby={
              credit.message ? 'credit-check-message' : undefined
            }
            aria-busy={create.isPending || waiting}
            disabled={create.isPending || waiting || !credit.canPost}
            id="submit-errand"
            type="submit"
          >
            {create.isPending
              ? 'Posting…'
              : waiting
                ? 'Reserving your credits…'
                : 'Post errand'}
            {!create.isPending && !waiting && <ArrowRight aria-hidden="true" />}
          </button>
        </div>
      </form>
    </section>
  )
}
