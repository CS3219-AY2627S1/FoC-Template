<template>
  <v-container class="py-6" max-width="1200">
    <!-- Page title, with manage buildings and add buttons for admins -->
    <div class="d-flex flex-wrap align-center justify-space-between ga-2 mb-4">
      <h1 class="text-h5 font-weight-bold">Suppliers</h1>

      <div v-if="auth.isAdmin" class="d-flex flex-wrap ga-2">
        <v-btn
          prepend-icon="mdi-office-building-cog-outline"
          variant="tonal"
          @click="isLocationsOpen = true"
        >
          Manage buildings
        </v-btn>

        <v-btn
          color="primary"
          prepend-icon="mdi-plus"
          variant="flat"
          @click="isCreateOpen = true"
        >
          Add supplier
        </v-btn>
      </div>
    </div>

    <!-- Admin: add supplier and manage buildings dialogs -->
    <supplier-form-dialog v-if="auth.isAdmin" v-model="isCreateOpen" @saved="loadSuppliers" />
    <location-manager-dialog v-if="auth.isAdmin" v-model="isLocationsOpen" @changed="loadLocations" />

    <!-- Search bar by supplier name -->
    <v-row dense>
      <v-col cols="12" md="5">
        <v-text-field
          v-model="search"
          clearable
          density="comfortable"
          hide-details
          label="Search by Name"
          prepend-inner-icon="mdi-magnify"
          variant="outlined"
        />
      </v-col>

      <!-- Filter by building -->
      <v-col cols="12" md="4" sm="6">
        <v-autocomplete
          v-model="locationId"
          clearable
          density="comfortable"
          hide-details
          item-title="name"
          item-value="id"
          :items="locations"
          label="Building"
          prepend-inner-icon="mdi-office-building-outline"
          variant="outlined"
        />
      </v-col>

      <!-- Sort by name (alphabetical) or ID (order added) -->
      <v-col cols="12" md="3" sm="6">
        <v-select
          v-model="sort"
          density="comfortable"
          hide-details
          :items="sortOptions"
          label="Sort by"
          prepend-inner-icon="mdi-sort"
          variant="outlined"
        />
      </v-col>
    </v-row>

    <!-- Show number of suppliers found and loading indicator -->
    <p class="text-body-2 text-medium-emphasis my-3">
      {{ isLoading ? 'Loading…' : `${total} supplier${total === 1 ? '' : 's'}` }}
    </p>

    <v-progress-linear v-if="isLoading" class="mb-4" color="primary" indeterminate />

    <!-- Show empty state if no suppliers found -->
    <v-empty-state
      v-if="!isLoading && suppliers.length === 0"
      icon="mdi-store-search-outline"
      :text="hasFilters ? 'Try a different search or clear some filters.' : 'There are no suppliers yet.'"
      title="No suppliers found"
    >
      <template v-if="hasFilters" #actions>
        <v-btn variant="tonal" @click="clearFilters">Clear filters</v-btn>
      </template>
    </v-empty-state>

    <!-- Formatting the layout/grid -->
    <v-row>
      <v-col
        v-for="supplier in suppliers"
        :key="supplier.id"
        cols="12"
        md="4"
        sm="6"
      >
        <!-- Each supplier is displayed as a card with an image, name, location, type, and open status -->
        <v-card
          class="h-100"
          rounded="lg"
          :to="{ name: 'supplier', params: { id: supplier.id } }"
        >
          <supplier-image :height="160" :supplier="supplier" />

          <v-card-item>
            <v-card-title class="text-wrap">{{ supplier.name }}</v-card-title>

            <v-card-subtitle>
              <v-icon size="small" start>mdi-map-marker-outline</v-icon>{{ formatLocation(supplier, locations) }}
            </v-card-subtitle>

            <template #append>
              <supplier-star-button size="small" :supplier-id="supplier.id" />
            </template>
          </v-card-item>

          <v-card-text class="d-flex flex-wrap ga-1">
            <v-chip
              v-for="type in supplier.type"
              :key="type"
              :color="supplierTypeInfo[type].color"
              label
              :prepend-icon="supplierTypeInfo[type].icon"
              size="small"
            >
              {{ supplierTypeInfo[type].label }}
            </v-chip>

            <v-chip :color="openStatus(supplier).color" label size="small" variant="tonal">
              {{ openStatus(supplier).label }}
            </v-chip>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <!-- Page numbers, 20 suppliers per page -->
    <v-pagination
      v-if="totalPage > 1"
      v-model="page"
      class="mt-6"
      :disabled="isLoading"
      :length="totalPage"
      :total-visible="7"
    />
  </v-container>
</template>

<script lang="ts" setup>
  import { computed, onMounted, ref, watch } from 'vue'
  import {
    listLocations,
    listSuppliers,
    type Location,
    type Supplier,
    type SupplierQuery,
  } from '@/api/supplier'
  import LocationManagerDialog from '@/components/LocationManagerDialog.vue'
  import SupplierFormDialog from '@/components/SupplierFormDialog.vue'
  import SupplierImage from '@/components/SupplierImage.vue'
  import SupplierStarButton from '@/components/SupplierStarButton.vue'
  import { useAlertStore } from '@/stores/alerts'
  import { useAuthStore } from '@/stores/auth'
  import { formatLocation, openStatus, supplierTypeInfo } from '@/util/supplier'

  const SEARCH_DEBOUNCE_MS = 300

  const alertStore = useAlertStore()
  const auth = useAuthStore()

  const isCreateOpen = ref(false)
  const isLocationsOpen = ref(false)

  type SortKey = `${SupplierQuery['sortBy']}-${SupplierQuery['sortOrder']}`

  // each option maps to the sortBy and sortOrder query parameters
  const sortOptions: { title: string, value: SortKey }[] = [
    { title: 'Name (A–Z)', value: 'name-asc' },
    { title: 'Name (Z–A)', value: 'name-desc' },
    { title: 'Oldest first', value: 'id-asc' },
    { title: 'Newest first', value: 'id-desc' },
  ]

  const suppliers = ref<Supplier[]>([])
  const locations = ref<Location[]>([])
  const isLoading = ref(false)

  // from the pagination details in the response
  const total = ref(0)
  const totalPage = ref(0)

  const search = ref<string | null>('')
  const locationId = ref<number | null>(null)
  const sort = ref<SortKey>('name-asc')
  const page = ref(1)

  const hasFilters = computed(() => Boolean(search.value?.trim()) || locationId.value !== null)

  // ignore responses from requests superseded by a newer filter change
  let latestRequest = 0

  async function loadSuppliers () {
    const request = ++latestRequest
    const [sortBy, sortOrder] = sort.value.split('-') as [SupplierQuery['sortBy'], SupplierQuery['sortOrder']]
    isLoading.value = true
    try {
      const result = await listSuppliers({
        name: search.value ?? undefined,
        locationId: locationId.value,
        sortBy,
        sortOrder,
        page: page.value,
      })
      if (request === latestRequest) {
        suppliers.value = result.data
        total.value = result.pagination.total
        totalPage.value = result.pagination.totalPage
      }
    } catch (error) {
      console.error('Error loading suppliers', error)
      if (request === latestRequest) {
        alertStore.error('Could not load suppliers')
      }
    } finally {
      if (request === latestRequest) {
        isLoading.value = false
      }
    }
  }

  async function loadLocations () {
    try {
      locations.value = await listLocations()
    } catch (error) {
      console.error('Error loading locations', error)
    }
  }

  function clearFilters () {
    search.value = ''
    locationId.value = null
  }

  // a new search, filter or sort starts again from page 1
  function reloadFromFirstPage () {
    if (page.value === 1) {
      loadSuppliers()
    } else {
      // the page watcher does the loading
      page.value = 1
    }
  }

  let searchTimer: ReturnType<typeof setTimeout> | undefined
  watch(search, () => {
    clearTimeout(searchTimer)
    searchTimer = setTimeout(reloadFromFirstPage, SEARCH_DEBOUNCE_MS)
  })
  watch([locationId, sort], reloadFromFirstPage)
  watch(page, () => {
    loadSuppliers()
    window.scrollTo({ top: 0, behavior: 'smooth' })
  })

  onMounted(() => {
    loadSuppliers()
    loadLocations()
  })
</script>
