'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronRight, MapPin } from 'lucide-react';

import { ErrorBanner } from '@/components/list-controls';
import {
  DropOffFields,
  dropOffFieldIds,
} from '@/components/orders/drop-off-fields';
import { PageContainer, PageHeader } from '@/components/page-header';
import { CreditOffer } from '@/components/request/credit-offer';
import { OrderConfirmation } from '@/components/request/order-confirmation';
import { Button } from '@/components/ui/button';
import { fieldClass } from '@/components/ui/field';
import type { CreditBalanceResult } from '@/lib/credit-actions';
import { offerLimits } from '@/lib/credits';
import {
  type DropOffValue,
  EMPTY_DROP_OFF,
  toDeliveryLocation,
} from '@/lib/drop-off';
import { newIdempotencyKey } from '@/lib/idempotency';
import { type OrderActionResult, createOrder } from '@/lib/order-actions';
import type { OrderCreate } from '@/lib/order-service';
import { MAX_ITEM_DESCRIPTION_LENGTH, type OrderView } from '@/lib/orders';
import {
  type PendingOrder,
  clearPendingOrder,
  isUncertainFailure,
  loadPendingOrder,
  sameRequest,
  savePendingOrder,
} from '@/lib/pending-order';
import type { Supplier } from '@/lib/supplier-service';
import { formatOpeningHours, formatSupplierLocation } from '@/lib/suppliers';
import { cn } from '@/lib/utils';

function RequiredTag() {
  return (
    <span className='ml-2 rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600'>
      Required
    </span>
  );
}

function FieldLabel({
  htmlFor,
  missing = false,
  children,
}: {
  htmlFor?: string;
  missing?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className='mb-2 block text-sm font-bold text-slate-900'
    >
      {children}
      {missing && <RequiredTag />}
    </label>
  );
}

const STORE_FIELD_ID = 'request-store';
const DESCRIPTION_FIELD_ID = 'description';
const DROP_OFF_PREFIX = 'request-drop-off';
const DROP_OFF_IDS = dropOffFieldIds(DROP_OFF_PREFIX);

/** A field that still blocks posting, and the control to focus for it. */
type MissingField = { label: string; fieldId?: string };

/** Lists what still blocks posting, so the disabled button can say why. */
function MissingFields({ fields }: { fields: MissingField[] }) {
  return (
    <p aria-live='polite' className='text-center text-sm text-slate-500'>
      To post, fill in:{' '}
      {fields.map(({ label, fieldId }, i) => (
        <span key={label}>
          {i > 0 && ', '}
          {fieldId ? (
            <button
              type='button'
              onClick={() => document.getElementById(fieldId)?.focus()}
              className='font-semibold text-red-600 underline-offset-2 hover:underline'
            >
              {label}
            </button>
          ) : (
            <span className='font-semibold text-red-600'>{label}</span>
          )}
        </span>
      ))}
    </p>
  );
}

/** The form as submitted, kept with a pending submission. */
type ErrandForm = {
  store: Supplier;
  description: string;
  dropOff: DropOffValue;
  credits: number;
};

const SAME_DETAILS_HINT =
  'Posting again with the same details won’t post it twice.';
const UNCONFIRMED_MESSAGE = `We couldn’t confirm whether your last request was posted. ${SAME_DETAILS_HINT}`;

type RequestErrandProps = {
  /** Store chosen in the directory, loaded from Supplier Service. */
  initialStore: Supplier | null;
  storeError: string | null;
  credit: CreditBalanceResult;
  /** What a user without a credit account will have once their first errand opens it. */
  initialAllocation: number;
};

export function RequestErrand({
  initialStore,
  storeError,
  credit,
  initialAllocation,
}: RequestErrandProps) {
  const router = useRouter();
  const [store, setStore] = useState(initialStore);
  const [description, setDescription] = useState('');
  const [dropOff, setDropOff] = useState(EMPTY_DROP_OFF);
  const [order, setOrder] = useState<OrderView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, startSubmitting] = useTransition();
  // A submission that may have been posted. Its key is reused while the
  // details stay the same, so a retry returns the original errand.
  const [pending, setPending] = useState<PendingOrder<ErrandForm> | null>(null);
  // The details changed after a submission that may have been posted.
  const [changedAfterPending, setChangedAfterPending] = useState(false);

  const limits = offerLimits(credit, initialAllocation);
  const [credits, setCredits] = useState(limits.initial);
  const delivery = toDeliveryLocation(dropOff);

  // After a refresh, bring back a submission whose outcome is still unknown.
  // Read after mount: the server render has no `sessionStorage`.
  useEffect(() => {
    const saved = loadPendingOrder<ErrandForm>();
    if (!saved) return;
    const { form } = saved;
    setPending(saved);
    // A store just picked in the directory wins over the saved one.
    setStore(initialStore ?? form.store);
    setDescription(form.description);
    setDropOff(form.dropOff);
    setCredits(form.credits);
    setError(UNCONFIRMED_MESSAGE);
    // Only on mount: a later server re-render must not overwrite edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const request: OrderCreate | null =
    store && delivery
      ? {
          pickup_supplier_id: store.id,
          delivery,
          item_description: description.trim(),
          credit_amount: credits,
        }
      : null;
  // Resending the pending request as-is is always safe: Order Service either
  // replays the original errand or creates it now. The credit limits are
  // skipped, since a reservation for it may already have lowered them.
  const retrying =
    pending !== null &&
    request !== null &&
    sameRequest(pending.request, request);

  const missing = {
    store: store === null,
    description: !description.trim(),
    point: !dropOff.position,
    credit: !limits.hasCredit,
  };
  const missingFields: MissingField[] = [
    missing.store && { label: 'Store', fieldId: STORE_FIELD_ID },
    missing.description && {
      label: 'Item description',
      fieldId: DESCRIPTION_FIELD_ID,
    },
    missing.point && { label: 'Drop-off point', fieldId: DROP_OFF_IDS.point },
    missing.credit && { label: 'Available credit' },
  ].filter((field): field is MissingField => Boolean(field));

  const isValid =
    missingFields.length === 0 && credits >= 1 && credits <= limits.max;
  const canSubmit = retrying || isValid;

  function forgetPending() {
    clearPendingOrder();
    setPending(null);
    setChangedAfterPending(false);
  }

  function reset() {
    forgetPending();
    setStore(null);
    setDescription('');
    setDropOff(EMPTY_DROP_OFF);
    setCredits(limits.initial);
    setOrder(null);
    setError(null);
    router.replace('/request');
  }

  function send(attempt: PendingOrder<ErrandForm>) {
    // Saved before sending, so a refresh mid-request still finds the key.
    savePendingOrder(attempt);
    setPending(attempt);
    setChangedAfterPending(false);
    setError(null);
    startSubmitting(async () => {
      let result: OrderActionResult;
      try {
        result = await createOrder(attempt.key, attempt.request);
      } catch {
        // The action itself never answered, so the errand may exist.
        setError(`Couldn’t reach the server. ${SAME_DETAILS_HINT}`);
        return;
      }
      if (result.ok) {
        forgetPending();
        setOrder(result.order);
        return;
      }
      if (isUncertainFailure(result.status)) {
        setError(`${result.message} ${SAME_DETAILS_HINT}`);
        return;
      }
      // Rejected before anything was posted: the details can change freely.
      forgetPending();
      setError(result.message);
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !request || !store) return;
    if (pending && !retrying) {
      // A new key here could post a second errand; ask first.
      setChangedAfterPending(true);
      return;
    }
    send({
      key: pending?.key ?? newIdempotencyKey(),
      request,
      form: { store, description, dropOff, credits },
    });
  }

  /** Puts the pending details back and resends them under their own key. */
  function resendPending() {
    if (!pending) return;
    const { form } = pending;
    setStore(form.store);
    setDescription(form.description);
    setDropOff(form.dropOff);
    setCredits(form.credits);
    send(pending);
  }

  /** Posts the edited details as a separate errand, as the user chose. */
  function postAsNew() {
    if (!isValid || !request || !store) return;
    send({
      key: newIdempotencyKey(),
      request,
      form: { store, description, dropOff, credits },
    });
  }

  return (
    <PageContainer>
      <PageHeader title='Request an Errand' />

      <div className='px-4 pt-4 md:px-0'>
        {order ? (
          <OrderConfirmation order={order} onReset={reset} />
        ) : (
          <form onSubmit={handleSubmit} className='space-y-6'>
            <div className='flex items-center gap-3'>
              <span className='bg-brand rounded-full px-3 py-1 text-xs font-bold text-white'>
                Step 1 of 3
              </span>
              <span className='text-sm font-medium text-slate-600'>
                Errand Details
              </span>
            </div>

            <div>
              {/* The store control is a link, which a label can't point to. */}
              <FieldLabel missing={missing.store}>
                1. Select Store or Facility
              </FieldLabel>
              <Link
                id={STORE_FIELD_ID}
                href='/request/store'
                className={cn(
                  fieldClass,
                  'flex h-12 items-center justify-between text-left',
                )}
              >
                <span className={cn(!store && 'text-slate-400')}>
                  {store?.name ?? 'Choose a location'}
                </span>
                <ChevronRight
                  className='size-5 shrink-0 text-slate-500'
                  aria-hidden
                />
              </Link>
              {storeError && !store && (
                <p role='alert' className='mt-2 text-sm text-red-600'>
                  {storeError}
                </p>
              )}
            </div>

            <div>
              <FieldLabel
                htmlFor={DESCRIPTION_FIELD_ID}
                missing={missing.description}
              >
                2. Item Description
              </FieldLabel>
              <textarea
                id={DESCRIPTION_FIELD_ID}
                rows={4}
                value={description}
                maxLength={MAX_ITEM_DESCRIPTION_LENGTH}
                onChange={(e) => setDescription(e.target.value)}
                placeholder='e.g. Iced Vanilla Latte (oat milk, less ice) and one chocolate croissant please!'
                className={cn(fieldClass, 'resize-none py-3')}
              />
              <p className='mt-1 text-right text-xs text-slate-400'>
                {description.length}/{MAX_ITEM_DESCRIPTION_LENGTH}
              </p>
            </div>

            <div>
              <FieldLabel>Pickup Location (Auto-filled)</FieldLabel>
              <p
                className={cn(
                  'bg-courier-soft flex min-h-12 items-center gap-2 rounded-xl px-4 py-3 text-sm',
                  store ? 'text-courier font-semibold' : 'text-slate-400',
                )}
              >
                <MapPin className='text-courier size-4 shrink-0' aria-hidden />
                {store ? (
                  <span>
                    {[
                      formatSupplierLocation(store) || store.area,
                      store.description,
                    ]
                      .filter(Boolean)
                      .join(', ')}
                    <span className='block text-xs font-medium'>
                      {formatOpeningHours(store)}
                    </span>
                  </span>
                ) : (
                  'Select a store to fill this in'
                )}
              </p>
            </div>

            <fieldset>
              <legend className='mb-2 text-sm font-bold text-slate-900'>
                3. Delivery Destination
              </legend>
              <DropOffFields
                idPrefix={DROP_OFF_PREFIX}
                value={dropOff}
                onChange={setDropOff}
                renderLabel={(htmlFor, text, fieldMissing) => (
                  <label
                    htmlFor={htmlFor}
                    className='mb-1.5 block text-xs font-semibold text-slate-600'
                  >
                    {text}
                    {fieldMissing && <RequiredTag />}
                  </label>
                )}
              />
            </fieldset>

            <CreditOffer
              value={credits}
              onChange={setCredits}
              max={limits.max}
              credit={credit}
              initialAllocation={initialAllocation}
            />

            {error && <ErrorBanner>{error}</ErrorBanner>}

            {changedAfterPending && pending && !retrying && (
              <div
                role='alert'
                className='space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900'
              >
                <p>
                  Your earlier request may already have been posted, so posting
                  these changes could create a second errand.{' '}
                  <Link href='/orders' className='font-semibold underline'>
                    Check My Errands
                  </Link>{' '}
                  first if you’re unsure.
                </p>
                <div className='flex flex-wrap gap-2'>
                  <Button
                    type='button'
                    variant='outline'
                    disabled={isSubmitting}
                    onClick={resendPending}
                  >
                    Post earlier details instead
                  </Button>
                  <Button
                    type='button'
                    variant='outline'
                    disabled={!isValid || isSubmitting}
                    onClick={postAsNew}
                  >
                    Post as a new errand
                  </Button>
                </div>
              </div>
            )}

            <Button
              type='submit'
              disabled={!canSubmit || isSubmitting}
              className='bg-brand hover:bg-brand-strong h-12 w-full rounded-xl text-base font-bold text-white'
            >
              {isSubmitting
                ? 'Posting…'
                : retrying
                  ? 'Try Again'
                  : 'Post Request'}
            </Button>
            {!retrying && missingFields.length > 0 && (
              <MissingFields fields={missingFields} />
            )}
          </form>
        )}
      </div>
    </PageContainer>
  );
}
