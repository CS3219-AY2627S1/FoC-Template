<template>
  <v-container class="py-6" max-width="1200">
    <!-- Page title, with manual refresh -->
    <div class="d-flex flex-wrap align-center justify-space-between ga-2 mb-1">
      <h1 class="text-h5 font-weight-bold">Open Errands</h1>

      <v-btn
        :loading="isLoading"
        prepend-icon="mdi-refresh"
        variant="tonal"
        @click="loadErrands"
      >
        Refresh
      </v-btn>
    </div>

    <p class="text-body-2 text-medium-emphasis mb-4">
      Errands from other students waiting for a courier. Open one to see the details and accept it.
    </p>

    <!-- Show number of open errands and loading indicator -->
    <p class="text-body-2 text-medium-emphasis mb-3">
      {{ isLoading && errands.length === 0 ? 'Loading…' : `${total} open errand${total === 1 ? '' : 's'}` }}
    </p>

    <v-progress-linear v-if="isLoading" class="mb-4" color="primary" indeterminate />

    <!-- Show empty state if nobody is waiting for a courier -->
    <v-empty-state
      v-if="!isLoading && visibleErrands.length === 0"
      icon="mdi-bike-fast"
      text="Nobody needs a courier right now. Check back later, or request an errand yourself."
      title="No open errands"
    >
      <template #actions>
        <v-btn :to="{ name: 'request-errand' }" variant="tonal">Request an Errand</v-btn>
      </template>
    </v-empty-state>

    <!-- Each open errand as a card linking to its details -->
    <v-row>
      <v-col
        v-for="errand in visibleErrands"
        :key="errand.id"
        cols="12"
        md="4"
        sm="6"
      >
        <errand-card :errand="errand" :now="now" />
      </v-col>
    </v-row>

    <!-- Page numbers, 20 errands per page -->
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
  import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
  import { listOrders, type Order } from '@/api/order'
  import ErrandCard from '@/components/ErrandCard.vue'
  import { useAlertStore } from '@/stores/alerts'
  import { useClock, useExpiryReload } from '@/util/clock'
  import { apiErrorMessage, hasExpired } from '@/util/order'

  // open errands change as others accept them, so the list refreshes itself
  const REFRESH_MS = 30_000

  const alertStore = useAlertStore()

  const errands = ref<Order[]>([])
  const isLoading = ref(false)
  const page = ref(1)
  const total = ref(0)
  const totalPage = ref(0)
  // ticks every second for the "expires in" countdown
  const now = useClock()

  // an errand that runs out of time leaves the list immediately; the reload below resyncs the count
  const visibleErrands = computed(() => errands.value.filter(e => !hasExpired(e, now.value)))

  // ignore responses from requests superseded by a newer one (e.g. a page change during a refresh)
  let latestRequest = 0

  async function loadErrands () {
    const request = ++latestRequest
    isLoading.value = true
    try {
      const result = await listOrders({ scope: 'open', page: page.value })
      if (request !== latestRequest) {
        return
      }
      errands.value = result.data
      total.value = result.pagination.total
      totalPage.value = result.pagination.totalPage
      // e.g. the last errand on the last page was just accepted
      if (page.value > 1 && result.data.length === 0) {
        page.value = Math.max(1, result.pagination.totalPage)
      }
    } catch (error) {
      console.error('Error loading open errands', error)
      if (request === latestRequest) {
        alertStore.error(apiErrorMessage(error, 'Could not load open errands'))
      }
    } finally {
      if (request === latestRequest) {
        isLoading.value = false
      }
    }
  }

  watch(page, () => {
    loadErrands()
    window.scrollTo({ top: 0, behavior: 'smooth' })
  })

  const timer = setInterval(() => {
    if (document.visibilityState === 'visible' && !isLoading.value) {
      loadErrands()
    }
  }, REFRESH_MS)
  onUnmounted(() => clearInterval(timer))

  useExpiryReload(() => errands.value, loadErrands)

  onMounted(loadErrands)
</script>
