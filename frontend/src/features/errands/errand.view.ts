import { getSupplier, listSupplierBuildings } from '../suppliers/supplier.api'
import type { Supplier, SupplierReference } from '../suppliers/supplier.types'
import { getErrand, listErrands } from './errand.api'
import type { ErrandDetails, ErrandViewerRole } from './errand-details.types'
import type { MyErrandItem, MyErrandProgress } from './my-errands.types'
import type { ErrandListItem } from './errand.types'

function throwIfAborted(results: PromiseSettledResult<unknown>[]) {
  const aborted = results.find(
    (result) =>
      result.status === 'rejected' &&
      result.reason instanceof DOMException &&
      result.reason.name === 'AbortError',
  )

  if (aborted?.status === 'rejected') throw aborted.reason
}

function getViewerRole(
  errand: ErrandListItem,
  currentUserId: string,
): ErrandViewerRole | null {
  if (errand.requester_id === currentUserId) return 'requester'
  if (errand.courier_id === currentUserId) return 'courier'
  return null
}

function getProgress(
  errand: ErrandListItem,
  role: ErrandViewerRole,
): MyErrandProgress | null {
  if (errand.status === 'OPEN' && role === 'requester') return 'waiting-for-courier'
  if (errand.status === 'ACCEPTED') return 'accepted'
  if (errand.status === 'DELIVERED') {
    return role === 'requester' ? 'ready-for-collection' : 'awaiting-confirmation'
  }
  return null
}

function getLastChangedAt(errand: ErrandListItem) {
  return (
    errand.failed_at ??
    errand.cancelled_at ??
    errand.completed_at ??
    errand.delivered_at ??
    errand.accepted_at ??
    errand.created_at
  )
}

function buildPresentationReferences(
  suppliers: Supplier[],
  buildings: SupplierReference[],
) {
  return {
    suppliersById: new Map(suppliers.map((supplier) => [supplier.id, supplier])),
    buildingsById: new Map(buildings.map((building) => [building.id, building])),
  }
}

async function loadPresentationReferences(
  errands: ErrandListItem[],
  signal?: AbortSignal,
) {
  const supplierIds = [...new Set(errands.map((errand) => errand.supplier_id))]
  const [buildingResult, ...supplierResults] = await Promise.allSettled([
    listSupplierBuildings(signal),
    ...supplierIds.map((supplierId) => getSupplier(supplierId, signal)),
  ])
  const results = [buildingResult, ...supplierResults]
  throwIfAborted(results)

  const buildings =
    buildingResult.status === 'fulfilled' ? buildingResult.value.items : []
  const suppliers = supplierResults.flatMap((result) =>
    result.status === 'fulfilled' ? [result.value] : [],
  )

  return buildPresentationReferences(suppliers, buildings)
}

export async function loadMyErrands(
  currentUserId: string,
  signal?: AbortSignal,
): Promise<MyErrandItem[]> {
  const [requested, delivering] = await Promise.all([
    listErrands(
      {
        requesterId: currentUserId,
        statuses: ['OPEN', 'ACCEPTED', 'DELIVERED'],
        sort: 'created_at,desc',
        page: 0,
        size: 100,
      },
      signal,
    ),
    listErrands(
      {
        courierId: currentUserId,
        statuses: ['ACCEPTED', 'DELIVERED'],
        sort: 'created_at,desc',
        page: 0,
        size: 100,
      },
      signal,
    ),
  ])
  const errandsById = new Map(
    [...requested.items, ...delivering.items].map((errand) => [errand.id, errand]),
  )
  const errands = [...errandsById.values()].sort(
    (left, right) =>
      new Date(getLastChangedAt(right)).getTime() -
      new Date(getLastChangedAt(left)).getTime(),
  )
  const { suppliersById, buildingsById } = await loadPresentationReferences(
    errands,
    signal,
  )

  return errands.flatMap((errand) => {
    const role = getViewerRole(errand, currentUserId)
    if (!role) return []

    const progress = getProgress(errand, role)
    if (!progress) return []

    const supplier = suppliersById.get(errand.supplier_id)
    const deliveryBuilding = buildingsById.get(errand.delivery_building_id)

    return [
      {
        id: errand.id,
        requiredItem: errand.required_item,
        pickupLocation: supplier?.name ?? 'Supplier unavailable',
        deliveryLocation: [
          deliveryBuilding?.name ?? 'Delivery location unavailable',
          errand.delivery_floor ? `Level ${errand.delivery_floor}` : null,
        ]
          .filter(Boolean)
          .join(', '),
        creditValue: errand.credit_value,
        role,
        progress,
        expiresAt: errand.expires_at,
      },
    ]
  })
}

export async function loadErrandDetails(
  errandId: string,
  currentUserId: string,
  signal?: AbortSignal,
): Promise<ErrandDetails> {
  const errand = await getErrand(errandId, signal)
  const role = getViewerRole(errand, currentUserId)

  if (!role) throw new Error('This errand is not assigned to your account.')

  const { suppliersById, buildingsById } = await loadPresentationReferences(
    [errand],
    signal,
  )
  const supplier = suppliersById.get(errand.supplier_id)
  const pickupLocation = [supplier?.building.name, supplier?.floor ? `Level ${supplier.floor}` : null]
    .filter(Boolean)
    .join(', ')

  return {
    id: errand.id,
    status: errand.status,
    viewerRole: role,
    requiredItem: errand.required_item,
    creditValue: errand.credit_value,
    supplierName: supplier?.name ?? 'Supplier unavailable',
    pickupLocation: pickupLocation || 'Pickup location unavailable',
    deliveryBuilding:
      buildingsById.get(errand.delivery_building_id)?.name ??
      'Delivery location unavailable',
    deliveryFloor: errand.delivery_floor,
    deliveryDescription: errand.delivery_description,
    requesterName: role === 'requester' ? 'You' : 'Requester',
    courierName: errand.courier_id
      ? role === 'courier'
        ? 'You'
        : 'Assigned courier'
      : null,
    createdAt: errand.created_at,
    expiresAt: errand.expires_at,
    acceptedAt: errand.accepted_at,
    deliveredAt: errand.delivered_at,
    completedAt: errand.completed_at,
    cancelledAt: errand.cancelled_at,
    failedAt: errand.failed_at,
    failureReason: errand.failure_reason,
  }
}

