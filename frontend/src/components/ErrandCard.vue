<!-- One errand as a card linking to its details, laid out like the supplier cards. Used by Open Errands, My Errands and the dashboard. -->
<template>
  <v-card class="h-full d-flex flex-column" rounded="lg" :to="{ name: 'errand', params: { id: errand.id } }">
    <!-- Supplier photo banner (the supplier pages' own image component), grey while loading or if the supplier is gone -->
    <supplier-image v-if="supplier" :height="160" :supplier="supplier" />

    <div v-else class="d-flex align-center justify-center bg-grey-lighten-3" style="height: 160px">
      <v-icon color="grey" size="48">{{ errand.pickupType === 'BUILDING' ? 'mdi-office-building-outline' : 'mdi-store-outline' }}</v-icon>
    </div>

    <v-card-item>
      <v-card-title class="text-wrap">{{ errand.itemDescription }}</v-card-title>
    </v-card-item>

    <!-- Pickup and dropoff -->
    <v-card-text class="flex-grow-1 pb-2">
      <div class="d-flex align-start ga-2 mb-2">
        <v-icon color="primary" size="small">{{ errand.pickupType === 'BUILDING' ? 'mdi-office-building-marker-outline' : 'mdi-store-marker-outline' }}</v-icon>
        <span>{{ errand.pickupLocation }}</span>
      </div>

      <div class="d-flex align-start ga-2">
        <v-icon color="error" size="small">mdi-map-marker-outline</v-icon>
        <span>{{ errand.dropoffLocation }}</span>
      </div>
    </v-card-text>

    <!-- Status (on lists that mix statuses), credits, time left while waiting, optional actions e.g. Reorder -->
    <v-card-actions class="px-4 pb-4 flex-wrap ga-2">
      <v-chip
        v-if="showStatus"
        :color="orderStatusInfo[errand.status].color"
        label
        :prepend-icon="orderStatusInfo[errand.status].icon"
        size="small"
        variant="tonal"
      >
        {{ orderStatusInfo[errand.status].label }}
      </v-chip>

      <v-chip color="success" label prepend-icon="mdi-hand-coin-outline" size="small">
        {{ errand.creditBounty }} credit{{ errand.creditBounty === 1 ? '' : 's' }}
      </v-chip>

      <v-spacer />

      <!-- time left while active -->
      <span v-if="deadlineLabel(errand, now)" class="text-caption text-medium-emphasis">
        {{ deadlineLabel(errand, now) }}
      </span>

      <slot name="actions" />
    </v-card-actions>
  </v-card>
</template>

<script lang="ts" setup>
  import type { Order } from '@/api/order'
  import type { Supplier } from '@/api/supplier'
  import { ref, watch } from 'vue'
  import SupplierImage from '@/components/SupplierImage.vue'
  import { deadlineLabel, orderStatusInfo } from '@/util/order'
  import { getSupplierCached } from '@/util/supplierCache'

  const props = defineProps<{
    errand: Order
    // current time, so "expires in" updates as the parent page refreshes
    now: number
    showStatus?: boolean
  }>()

  // looked up through a shared cache, so each supplier is fetched once per page load
  const supplier = ref<Supplier | null>(null)
  watch(() => props.errand.supplierId, async id => {
    // building pickups have no supplier, so no photo
    supplier.value = id === null ? null : await getSupplierCached(id)
  }, { immediate: true })
</script>
