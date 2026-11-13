// Compiled by the host build. Every expected error must remain an error.
import type { CreditRemoteProps, RemotePropsByService } from '@relay/contracts'
import type { RemotePageProps } from './RemotePage'
import type { loadServiceRemote, RemoteComponents } from './RemoteLoader'

type Assert<T extends true> = T
export type CreditLoaderMatches = Assert<
  Awaited<
    ReturnType<typeof loadServiceRemote<'credit'>>
  >['default'] extends RemoteComponents['credit']
    ? true
    : false
>

export function verifyRemoteContracts(props: RemotePropsByService) {
  const presentation = { serviceLabel: 'Test', visible: true }
  const valid: RemotePageProps[] = [
    { ...presentation, service: 'credit', appProps: props.credit },
    { ...presentation, service: 'supplier', appProps: props.supplier },
    { ...presentation, service: 'errand', appProps: props.errand },
    { ...presentation, service: 'user', appProps: props.user },
  ]
  // @ts-expect-error Credit cannot receive supplier props.
  const wrongCredit: RemotePageProps = {
    ...presentation,
    service: 'credit',
    appProps: props.supplier,
  }
  // @ts-expect-error Supplier cannot receive errand props.
  const wrongSupplier: RemotePageProps = {
    ...presentation,
    service: 'supplier',
    appProps: props.errand,
  }
  // @ts-expect-error Errand cannot receive user props.
  const wrongErrand: RemotePageProps = { ...presentation, service: 'errand', appProps: props.user }
  // @ts-expect-error User cannot receive credit props.
  const wrongUser: RemotePageProps = { ...presentation, service: 'user', appProps: props.credit }
  // @ts-expect-error Required dependencies cannot be omitted.
  const missing: RemotePageProps = { ...presentation, service: 'credit', appProps: {} }
  // @ts-expect-error Credit has no supplier dependency.
  const unrelated: CreditRemoteProps = { ...props.credit, supplierApi: props.supplier.supplierApi }
  // @ts-expect-error Supplier cannot create errands directly.
  const cannotCreate = props.supplier.errandApi.createErrand
  // @ts-expect-error Errand cannot administer suppliers.
  const cannotRemove = props.errand.supplierApi.removeSupplier
  const backend: RemotePageProps = {
    ...presentation,
    // @ts-expect-error Backend-only services cannot be loaded as a page.
    service: 'credit-estimation',
    appProps: props.credit,
  }
  return [
    valid,
    wrongCredit,
    wrongSupplier,
    wrongErrand,
    wrongUser,
    missing,
    unrelated,
    backend,
    cannotCreate,
    cannotRemove,
  ]
}
