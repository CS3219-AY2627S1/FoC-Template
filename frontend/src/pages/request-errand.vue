<template>
  <v-container class="py-6" max-width="720">
    <!-- Page title -->
    <h1 class="text-h5 font-weight-bold mb-1">Request an Errand</h1>

    <p class="text-body-2 text-medium-emphasis mb-4">
      Pick where the item is collected from (a supplier, or anywhere in a building) and which building it should be delivered to. A courier will accept it and earn the credits you offer.
    </p>

    <v-skeleton-loader v-if="isPrefilling" type="article, actions" />

    <v-card v-else rounded="lg">
      <v-card-text class="pa-6">
        <v-form ref="formRef" :disabled="isSubmitting" @submit.prevent="submit">
          <!-- Pickup: a registered supplier, or a spot in a building -->
          <div class="text-subtitle-2 mb-2">Pick up from</div>

          <v-btn-toggle
            v-model="form.pickupType"
            class="mb-4"
            color="primary"
            density="comfortable"
            divided
            mandatory
            variant="outlined"
          >
            <v-btn prepend-icon="mdi-store-marker-outline" value="SUPPLIER">Supplier</v-btn>
            <v-btn prepend-icon="mdi-office-building-marker-outline" value="BUILDING">Building</v-btn>
          </v-btn-toggle>

          <!-- favourite suppliers, one tap to pick -->
          <div
            v-if="form.pickupType === 'SUPPLIER' && favouriteStore.suppliers.length > 0"
            class="d-flex flex-wrap align-center ga-2 mb-3"
          >
            <span class="text-caption text-medium-emphasis">Favourites:</span>

            <v-chip
              v-for="f in favouriteStore.suppliers"
              :key="f.id"
              :color="form.supplierId === f.targetId ? 'primary' : undefined"
              :disabled="isSubmitting || !f.supplier"
              prepend-icon="mdi-star"
              size="small"
              :variant="form.supplierId === f.targetId ? 'flat' : 'tonal'"
              @click="selectSupplier(f.targetId)"
            >
              {{ f.label ?? f.supplier?.name ?? 'Supplier' }}
            </v-chip>
          </div>

          <!-- registered supplier, searched as you type -->
          <v-autocomplete
            v-if="form.pickupType === 'SUPPLIER'"
            v-model="form.supplierId"
            v-model:search="supplierSearch"
            class="mb-2"
            density="comfortable"
            :error-messages="serverErrors.supplierId"
            item-title="name"
            item-value="id"
            :items="supplierOptions"
            label="Supplier *"
            :loading="isSearchingSuppliers"
            no-filter
            prepend-inner-icon="mdi-store-marker-outline"
            :rules="[(v: number | null) => v !== null || 'Choose a supplier to pick up from']"
            variant="outlined"
          >
            <template #item="{ props: itemProps, item }">
              <v-list-item v-bind="itemProps" :subtitle="formatLocation(item, locations)" />
            </template>

            <template #no-data>
              <v-list-item :title="supplierSearch ? 'No suppliers match your search' : 'Type to search suppliers'" />
            </template>
          </v-autocomplete>

          <!-- any spot in a building, e.g. a friend's room -->
          <template v-else>
            <favourite-spot-picker v-model="form.pickup" :disabled="isSubmitting" :locations="locations" />

            <building-spot-fields
              v-model="form.pickup"
              :errors="spotErrors('pickup')"
              icon="mdi-office-building-marker-outline"
              label="Building"
              :locations="locations"
            />
          </template>

          <!-- Dropoff: always a spot in a building -->
          <div class="text-subtitle-2 mb-4">Deliver to</div>

          <favourite-spot-picker v-model="form.dropoff" :disabled="isSubmitting" :locations="locations" />

          <building-spot-fields
            v-model="form.dropoff"
            class="mb-2"
            :errors="spotErrors('dropoff')"
            icon="mdi-map-marker-outline"
            label="Building"
            :locations="locations"
          />

          <!-- Item -->
          <v-textarea
            v-model="form.itemDescription"
            auto-grow
            class="mb-2"
            counter="500"
            density="comfortable"
            :error-messages="serverErrors.itemDescription"
            label="What should the courier collect? *"
            placeholder="e.g. Printed CS3230 assignment, 20 pages"
            prepend-inner-icon="mdi-package-variant"
            rows="2"
            :rules="[required('Item description'), maxLength(500)]"
            variant="outlined"
          />

          <!-- Credits offered -->
          <!-- mb-5: the hint wraps to two lines on phones and needs room before the next label -->
          <v-text-field
            v-model="form.creditBounty"
            class="mb-5"
            density="comfortable"
            :error-messages="serverErrors.creditBounty"
            hint="Reserved from your balance now; the courier earns them on delivery"
            label="Credits offered *"
            min="1"
            persistent-hint
            prepend-inner-icon="mdi-hand-coin-outline"
            :rules="[wholeNumberAtLeastOne]"
            type="number"
            variant="outlined"
          />

          <!-- The deadline, shared by requester and courier: a preset (24 hours pre-selected) or a custom duration -->
          <v-select
            v-model="form.expiryChoice"
            class="mb-5"
            density="comfortable"
            :error-messages="serverErrors.expiresInMinutes"
            :hint="expiryHint"
            :items="expiryItems"
            label="Deliver within"
            persistent-hint
            prepend-inner-icon="mdi-timer-sand"
            variant="outlined"
          />

          <!-- Custom duration, 15 minutes to 24 hours -->
          <v-row v-if="form.expiryChoice === 'custom'" class="mb-2" dense>
            <v-col cols="6">
              <v-text-field
                v-model="form.customHours"
                density="comfortable"
                :error="customExpiryError !== null"
                label="Hours"
                max="24"
                min="0"
                type="number"
                variant="outlined"
              />
            </v-col>

            <v-col cols="6">
              <v-text-field
                v-model="form.customMinutes"
                density="comfortable"
                :error-messages="customExpiryError ?? undefined"
                label="Minutes"
                max="59"
                min="0"
                type="number"
                variant="outlined"
              />
            </v-col>
          </v-row>

          <!-- Optional details -->
          <v-textarea
            v-model="form.additionalDetails"
            auto-grow
            counter="500"
            density="comfortable"
            :error-messages="serverErrors.additionalDetails"
            label="Additional details"
            placeholder="e.g. Ask for the order under my name; call me when you arrive"
            prepend-inner-icon="mdi-text-box-outline"
            rows="2"
            :rules="[maxLength(500)]"
            variant="outlined"
          />
        </v-form>
      </v-card-text>

      <v-card-actions class="px-6 pb-6">
        <v-spacer />
        <v-btn :disabled="isSubmitting" variant="text" @click="resetForm">Clear</v-btn>

        <v-btn
          color="primary"
          :loading="isSubmitting"
          prepend-icon="mdi-send"
          variant="flat"
          @click="submit"
        >
          Request Errand
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-container>
</template>

<script lang="ts" setup>
  import type { VForm } from 'vuetify/components'
  import axios from 'axios'
  import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
  import { useRoute, useRouter } from 'vue-router'
  import { createOrder, getOrder, type PickupType } from '@/api/order'
  import { getSupplier, listLocations, listSuppliers, type Location, type Supplier } from '@/api/supplier'
  import BuildingSpotFields, { type BuildingSpotInput } from '@/components/BuildingSpotFields.vue'
  import FavouriteSpotPicker from '@/components/FavouriteSpotPicker.vue'
  import { useAlertStore } from '@/stores/alerts'
  import { useFavouriteStore } from '@/stores/favourites'
  import { apiErrorMessage, DEFAULT_EXPIRY_MINUTES, EXPIRY_OPTIONS, formatDateTime } from '@/util/order'
  import { floorInput, formatLocation, parseFloor } from '@/util/supplier'
  import { randomUUID } from '@/util/uuid'

  const SEARCH_DEBOUNCE_MS = 300

  const route = useRoute()
  const router = useRouter()
  const alertStore = useAlertStore()
  const favouriteStore = useFavouriteStore()

  interface FormState {
    pickupType: PickupType
    // SUPPLIER pickup
    supplierId: number | null
    // BUILDING pickup
    pickup: BuildingSpotInput
    dropoff: BuildingSpotInput
    itemDescription: string
    // text input, converted when submitting
    creditBounty: string
    additionalDetails: string
    // a preset number of minutes, or 'custom' to type hours and minutes
    expiryChoice: number | 'custom'
    // text inputs for the custom duration
    customHours: string
    customMinutes: string
  }

  function emptySpot (): BuildingSpotInput {
    return { locationId: null, floor: '', room: '' }
  }

  // a past errand's building spot, or empty for errands made before buildings were stored
  function spotFrom (locationId: number | null, floor: number | null, room: string | null): BuildingSpotInput {
    return locationId === null
      ? emptySpot()
      : { locationId, floor: floor === null ? '' : floorInput(floor), room: room ?? '' }
  }

  function emptyForm (): FormState {
    return {
      pickupType: 'SUPPLIER',
      supplierId: null,
      pickup: emptySpot(),
      dropoff: emptySpot(),
      itemDescription: '',
      creditBounty: '',
      additionalDetails: '',
      expiryChoice: DEFAULT_EXPIRY_MINUTES,
      customHours: '',
      customMinutes: '',
    }
  }

  const formRef = ref<VForm | null>(null)
  const form = ref<FormState>(emptyForm())
  const serverErrors = ref<Record<string, string[]>>({})

  // the order service names building fields e.g. dropoffFloor; pass each spot its own errors
  function spotErrors (prefix: 'pickup' | 'dropoff') {
    const errors = serverErrors.value
    return {
      locationId: errors[`${prefix}LocationId`],
      floor: errors[`${prefix}Floor`],
      room: errors[`${prefix}Room`],
    }
  }
  const isSubmitting = ref(false)
  const isPrefilling = ref(false)

  const expiryItems = [...EXPIRY_OPTIONS, { title: 'Custom…', value: 'custom' as const }]

  // the same limits the order service enforces
  const MIN_EXPIRY_MINUTES = 15
  const MAX_EXPIRY_MINUTES = 24 * 60

  // why the custom duration is invalid, or null when it is fine (or not in use)
  const customExpiryError = computed(() => {
    if (form.value.expiryChoice !== 'custom') {
      return null
    }
    const hours = Number(form.value.customHours || 0)
    const minutes = Number(form.value.customMinutes || 0)
    if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || minutes < 0 || minutes > 59) {
      return 'Use whole hours and 0-59 minutes'
    }
    const total = hours * 60 + minutes
    return total < MIN_EXPIRY_MINUTES || total > MAX_EXPIRY_MINUTES ? 'Choose between 15 minutes and 24 hours' : null
  })

  // minutes to send, or null while the custom duration is invalid
  const expiresInMinutes = computed(() => {
    if (form.value.expiryChoice !== 'custom') {
      return form.value.expiryChoice
    }
    return customExpiryError.value === null
      ? Number(form.value.customHours || 0) * 60 + Number(form.value.customMinutes || 0)
      : null
  })

  // re-computed every 30 s, so "expires by" in the hint stays current while the form is open
  const now = ref(Date.now())
  const clock = setInterval(() => (now.value = Date.now()), 30_000)
  onUnmounted(() => clearInterval(clock))
  const expiryHint = computed(() => expiresInMinutes.value === null
    ? 'Choose a deadline between 15 minutes and 24 hours'
    : `It must be delivered by ${formatDateTime(new Date(now.value + expiresInMinutes.value * 60_000).toISOString())}, or it expires and your credits are returned`)

  // switching to Custom starts from the duration chosen so far, e.g. 24 hours -> 24 h 0 min
  watch(() => form.value.expiryChoice, (choice, previous) => {
    if (choice === 'custom' && typeof previous === 'number') {
      form.value.customHours = String(Math.floor(previous / 60))
      form.value.customMinutes = String(previous % 60)
    }
  })

  // one key per errand being filled in, so a retried submit cannot create a duplicate
  let idempotencyKey = randomUUID()

  const supplierSearch = ref('')
  const supplierOptions = ref<Supplier[]>([])
  const locations = ref<Location[]>([])
  const isSearchingSuppliers = ref(false)

  // validation rules, the order service checks these again
  const required = (label: string) => (v: string) => v.trim().length > 0 || `${label} is required`
  const maxLength = (max: number) => (v: string) => v.length <= max || `At most ${max} characters`
  const wholeNumberAtLeastOne = (v: string) => (Number.isInteger(Number(v)) && Number(v) >= 1) || 'Enter a whole number of at least 1'

  // ignore search results superseded by newer typing
  let latestSearch = 0
  async function searchSuppliers (name: string) {
    const search = ++latestSearch
    isSearchingSuppliers.value = true
    try {
      const page = await listSuppliers({ name, sortBy: 'name', sortOrder: 'asc', page: 1 })
      if (search !== latestSearch) {
        return
      }
      // keep the chosen supplier in the list so its name still shows
      const chosen = supplierOptions.value.find(s => s.id === form.value.supplierId)
      supplierOptions.value = chosen && !page.data.some(s => s.id === chosen.id) ? [chosen, ...page.data] : page.data
    } catch (error) {
      console.error('Error searching suppliers', error)
    } finally {
      if (search === latestSearch) {
        isSearchingSuppliers.value = false
      }
    }
  }

  let searchTimer: ReturnType<typeof setTimeout> | undefined
  watch(supplierSearch, value => {
    // the search box shows the chosen supplier's name after selecting; no need to search for it
    const chosen = supplierOptions.value.find(s => s.id === form.value.supplierId)
    if (chosen && value === chosen.name) {
      return
    }
    clearTimeout(searchTimer)
    searchTimer = setTimeout(() => searchSuppliers(value ?? ''), SEARCH_DEBOUNCE_MS)
  })

  // pre-select a supplier, e.g. from ?supplierId= or a past order
  async function selectSupplier (id: number) {
    try {
      const supplier = await getSupplier(id)
      supplierOptions.value = [supplier, ...supplierOptions.value.filter(s => s.id !== id)]
      form.value.supplierId = id
    } catch {
      alertStore.warning('That supplier is no longer available, please choose another')
    }
  }

  // ?from=<orderId> copies a past order (reorder); ?supplierId=<id> pre-selects a supplier
  async function prefill () {
    const fromOrder = route.query.from
    const supplierId = Number(route.query.supplierId)
    if (typeof fromOrder === 'string') {
      isPrefilling.value = true
      try {
        const order = await getOrder(fromOrder)
        // keep the past errand's wait time: as a preset when it matches one, otherwise as a custom duration
        const pastMinutes = Math.min(MAX_EXPIRY_MINUTES, Math.max(MIN_EXPIRY_MINUTES,
                                                                  Math.round((Date.parse(order.expiresAt) - Date.parse(order.createdAt)) / 60_000)))
        const isPreset = EXPIRY_OPTIONS.some(o => o.value === pastMinutes)
        form.value = {
          pickupType: order.pickupType,
          supplierId: null,
          pickup: spotFrom(order.pickupLocationId, order.pickupFloor, order.pickupRoom),
          dropoff: spotFrom(order.dropoffLocationId, order.dropoffFloor, order.dropoffRoom),
          itemDescription: order.itemDescription,
          creditBounty: String(order.creditBounty),
          additionalDetails: order.additionalDetails ?? '',
          expiryChoice: isPreset ? pastMinutes : 'custom',
          customHours: isPreset ? '' : String(Math.floor(pastMinutes / 60)),
          customMinutes: isPreset ? '' : String(pastMinutes % 60),
        }
        if (order.supplierId !== null) {
          await selectSupplier(order.supplierId)
        }
      } catch (error) {
        console.error('Error loading order to reorder', error)
        alertStore.error('Could not load that errand to reorder')
      } finally {
        isPrefilling.value = false
      }
    } else if (Number.isInteger(supplierId) && supplierId > 0) {
      await selectSupplier(supplierId)
    }
  }

  async function resetForm () {
    form.value = emptyForm()
    serverErrors.value = {}
    idempotencyKey = randomUUID()
    // wait until the cleared values reach the inputs, otherwise they re-validate as empty and show errors
    await nextTick()
    formRef.value?.resetValidation()
  }

  async function submit () {
    serverErrors.value = {}
    const result = await formRef.value?.validate()
    // the custom duration is checked separately (it spans two fields)
    if (!result?.valid || expiresInMinutes.value === null || isSubmitting.value) {
      return
    }

    isSubmitting.value = true
    try {
      const { pickup, dropoff } = form.value
      const pickupFields = form.value.pickupType === 'SUPPLIER'
        ? { supplierId: form.value.supplierId! }
        : {
          pickupLocationId: pickup.locationId!,
          pickupFloor: parseFloor(pickup.floor)!,
          pickupRoom: pickup.room.trim() || null,
        }
      const order = await createOrder({
        pickupType: form.value.pickupType,
        ...pickupFields,
        dropoffLocationId: dropoff.locationId!,
        dropoffFloor: parseFloor(dropoff.floor)!,
        dropoffRoom: dropoff.room.trim() || null,
        itemDescription: form.value.itemDescription.trim(),
        creditBounty: Number(form.value.creditBounty),
        additionalDetails: form.value.additionalDetails.trim() || null,
        expiresInMinutes: expiresInMinutes.value!,
      }, idempotencyKey)
      alertStore.success(`Errand requested: ${order.itemDescription}`)
      // the next errand gets a fresh key; then show the new errand's details and progress
      idempotencyKey = randomUUID()
      router.push({ name: 'errand', params: { id: order.id } })
    } catch (error) {
      // field errors from the order service are shown next to their inputs
      const data = axios.isAxiosError(error) ? error.response?.data : undefined
      if (data?.fields && Object.keys(data.fields).length > 0) {
        serverErrors.value = data.fields
      } else {
        console.error('Error requesting errand', error)
        alertStore.error(apiErrorMessage(error, 'Could not request the errand, please try again'))
      }
    } finally {
      isSubmitting.value = false
    }
  }

  onMounted(async () => {
    try {
      locations.value = await listLocations()
    } catch (error) {
      console.error('Error loading buildings', error)
    }
    await Promise.all([searchSuppliers(''), prefill(), favouriteStore.ensureLoaded()])
  })
</script>
