// AI Assistance Disclosure:
// Tool: ChatGPT (model: GPT-5.6 Luna), date: 2026-10-11
// Scope: Generated initial implementation of the Errand Service domain service.
// Author review: I validated correctness, edited for domain needs, and debugged as necessary.

import {
  CreateErrandRequest,
  Errand,
  ErrandErrors,
  ErrandStatus,
  GetErrandsOptions,
  SupplierErrandSummary,
  SupplierErrandViewRequest,
  type ErrandLocation,
  type OperatingHours,
  type ServiceType,
} from '@relay/contracts'
import { ErrandRepository } from '../repositories/errand.repository.js'
import { ErrandServiceError, type AuthenticatedUser } from '../types/errand.types.js'
import { CreditClient } from '../clients/credit.client.js'
import { UserClient } from '../clients/user.client.js'
import { SupplierClient } from '../clients/supplier.client.js'
import { translateError } from '../utils/translate-error.js'

export class ErrandService {
  constructor(
    private readonly repository: ErrandRepository,
    private readonly creditClient: CreditClient = new CreditClient(),
    private readonly supplierClient: SupplierClient,
    private readonly userClient: UserClient = new UserClient(),
  ) {}

  async createErrand(user: AuthenticatedUser, request: CreateErrandRequest): Promise<Errand> {
    if (!user.emailVerified) {
      throw new ErrandServiceError(
        ErrandErrors.FORBIDDEN,
        'A verified email is required to create an errand.',
        403,
      )
    }

    const profile = await this.userClient.getProfile(user.sub)
    if (!profile) {
      throw new ErrandServiceError(
        ErrandErrors.INVALID_ERRAND,
        'A completed profile is required to create an errand.',
        400,
      )
    }

    // Validate the supplier's current operational status before reserving credit
    // or creating any pending/database records. serviceType remains optional.
    try {
      await this.supplierClient.validateSelection({
        supplierId: request.supplierDetails.supplierId,
        serviceType: request.supplierDetails.serviceType as ServiceType,
      })
    } catch (error) {
      if (error instanceof ErrandServiceError) {
        if (error.code === ErrandErrors.SUPPLIER_UNAVAILABLE) {
          throw error
        }
        if (error.code === ErrandErrors.SUPPLIER_INACTIVE) {
          throw error
        }
        if (error.code === ErrandErrors.SERVICE_TYPE_NOT_OFFERED) {
          throw error
        }

        throw new ErrandServiceError(
          ErrandErrors.INVALID_ERRAND,
          error.message,
          error.statusCode,
          error.fieldErrors,
        )
      }
      throw error
    }

    const id = await this.repository.addPendingErrand(user.sub)
    try {
      await this.creditClient.reserve(id, user.sub, request.creditAmount)
      return this.repository.createErrand(id, user.sub, request)
    } catch (error) {
      // On failure, publish ERRAND_CREATION_FAILED to trigger credit release via Kafka
      await this.repository.publishCreationFailedEvent(id, user.sub)
      await this.repository.deletePendingErrand(id)
      throw error
    }
  }

  async getErrands(user: AuthenticatedUser, options: GetErrandsOptions = {}): Promise<Errand[]> {
    await this.processDueReadLifecycleTransitions()
    const errands =
      options.scope === 'mine'
        ? this.repository.listOwnedBy(user.sub)
        : this.repository.listVisibleTo(user.sub)
    return this.enrichCourierProfiles(await errands)
  }

  async getSupplierErrandView(
    user: AuthenticatedUser,
    request: SupplierErrandViewRequest,
  ): Promise<SupplierErrandSummary[]> {
    await this.processDueReadLifecycleTransitions()
    return this.repository.listSupplierView({ ...request, viewerSub: user.sub })
  }

  async listBySupplier(supplierId: string): Promise<Errand[]> {
    await this.processDueReadLifecycleTransitions()
    return this.enrichCourierProfiles(await this.repository.listBySupplier(supplierId))
  }

  async listOpenBySupplier(supplierId: string): Promise<Errand[]> {
    await this.repository.expireOpenErrands()
    return this.enrichCourierProfiles(await this.repository.listOpenBySupplier(supplierId))
  }

  async getErrand(user: AuthenticatedUser, id: string): Promise<Errand> {
    await this.processDueReadLifecycleTransitions()
    const errand = await this.repository.findVisibleById(id, user.sub)
    if (!errand) {
      throw new ErrandServiceError(ErrandErrors.NOT_FOUND, 'Errand was not found.', 404)
    }
    return this.enrichCourierProfile(errand)
  }

  async acceptErrand(courier: AuthenticatedUser, id: string): Promise<Errand> {
    await this.repository.expireOpenErrands()

    const requesterSub = await this.repository.findRequesterForAcceptance(id)
    if (requesterSub) {
      const requesterProfile = await this.userClient.getProfile(requesterSub)
      if (!requesterProfile) {
        throw new ErrandServiceError(
          ErrandErrors.REQUESTER_DELETED,
          'The requester account has been deleted.',
          409,
        )
      }
    }

    try {
      const updated = await this.repository.accept(id, courier.sub)
      return this.enrichCourierProfile(updated)
    } catch (error) {
      throw translateError(error as Error)
    }
  }

  async cancelErrand(user: AuthenticatedUser, id: string): Promise<Errand> {
    try {
      return this.enrichCourierProfile(await this.repository.cancel(id, user.sub))
    } catch (error) {
      throw translateError(error as Error)
    }
  }

  async deliverErrand(user: AuthenticatedUser, id: string): Promise<Errand> {
    try {
      return this.enrichCourierProfile(await this.repository.deliver(id, user.sub))
    } catch (error) {
      throw translateError(error as Error)
    }
  }

  async confirmErrand(user: AuthenticatedUser, id: string): Promise<Errand> {
    await this.repository.confirmDeliveredErrands()

    try {
      return this.enrichCourierProfile(await this.repository.confirm(id, user.sub))
    } catch (error) {
      throw translateError(error as Error)
    }
  }

  async pickUpErrand(user: AuthenticatedUser, id: string): Promise<Errand> {
    try {
      return this.enrichCourierProfile(await this.repository.pickUp(id, user.sub))
    } catch (error) {
      throw translateError(error as Error)
    }
  }

  async dropErrand(user: AuthenticatedUser, id: string): Promise<Errand> {
    try {
      return this.enrichCourierProfile(await this.repository.drop(id, user.sub))
    } catch (error) {
      throw translateError(error as Error)
    }
  }

  async deleteErrand(user: AuthenticatedUser, id: string): Promise<void> {
    try {
      await this.repository.delete(id, user.sub)
    } catch (error) {
      throw translateError(error as Error)
    }
  }

  async receiveSupplierEvent(event: {
    supplierId: string
    name?: string
    location?: ErrandLocation
    operatingHours?: OperatingHours
    isOperational?: boolean
    serviceTypes?: ServiceType[]
  }): Promise<{ processed: boolean; affectedErrandIds: string[] }> {
    if (!event.supplierId) {
      return {
        processed: false,
        affectedErrandIds: [],
      }
    }

    // If supplier is no longer operational, delete all open/accepted errands
    if (event.isOperational === false) {
      const result = await this.repository.deleteOpenOrAcceptedErrandsBySupplier(event.supplierId)
      return {
        processed: true,
        affectedErrandIds: result.deletedErrandIds,
      }
    }

    // Supplier is still operational - update open/accepted errands with new info
    const updatedErrands = await this.repository.updateErrandsBySupplier(event.supplierId, {
      name: event.name,
      location: event.location,
      operatingHours: event.operatingHours,
      serviceTypes: event.serviceTypes,
    })

    return { processed: true, affectedErrandIds: updatedErrands.deletedErrandIds }
  }

  private async enrichCourierProfiles(errands: Errand[]): Promise<Errand[]> {
    return Promise.all(errands.map((errand) => this.enrichCourierProfile(errand)))
  }

  private async processDueReadLifecycleTransitions(): Promise<void> {
    await this.repository.expireOpenErrands()
    await this.repository.confirmDeliveredErrands()
  }

  private async enrichCourierProfile(errand: Errand): Promise<Errand> {
    if (!errand.courierSub) return errand
    return {
      ...errand,
      courierProfile: await this.userClient.getProfile(errand.courierSub),
    }
  }
}
