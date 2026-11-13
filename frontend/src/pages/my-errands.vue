<template>
  <v-container class="py-6" max-width="1200">
    <!-- Page title, with a shortcut to request another errand -->
    <div class="d-flex flex-wrap align-center justify-space-between ga-2 mb-4">
      <h1 class="text-h5 font-weight-bold">My Errands</h1>

      <v-btn color="primary" prepend-icon="mdi-plus" :to="{ name: 'request-errand' }" variant="flat">
        Request Errand
      </v-btn>
    </div>

    <!-- Requested (I am the requester) or Delivering (I am the courier) -->
    <v-tabs v-model="tab" class="mb-4" color="primary">
      <v-tab prepend-icon="mdi-account-arrow-right-outline" value="requested">Requested</v-tab>
      <v-tab prepend-icon="mdi-bike-fast" value="delivering">Delivering</v-tab>
    </v-tabs>

    <!-- Active (still in progress) or Past (completed, cancelled, expired) -->
    <div class="d-flex flex-wrap align-center justify-space-between ga-2 mb-3">
      <v-btn-toggle
        v-model="view"
        color="primary"
        density="comfortable"
        mandatory
        variant="outlined"
      >
        <v-btn value="active">Active</v-btn>
        <v-btn value="past">Past</v-btn>
      </v-btn-toggle>

      <span class="text-body-2 text-medium-emphasis">
        {{ isLoading && errands.length === 0 ? 'Loading…' : `${total} errand${total === 1 ? '' : 's'}` }}
      </span>
    </div>

    <v-progress-linear v-if="isLoading" class="mb-4" color="primary" indeterminate />

    <!-- Show empty state, with the next step for this tab -->
    <v-empty-state
      v-if="!isLoading && errands.length === 0"
      :icon="tab === 'requested' ? 'mdi-package-variant' : 'mdi-bike-fast'"
      :text="emptyText"
      :title="`No ${view} errands`"
    >
      <template #actions>
        <v-btn v-if="tab === 'requested'" :to="{ name: 'request-errand' }" variant="tonal">Request an Errand</v-btn>
        <v-btn v-else :to="{ name: 'open-errands' }" variant="tonal">Browse Open Errands</v-btn>
      </template>
    </v-empty-state>

    <!-- Each errand as a card linking to its details; past requested errands can be reordered -->
    <v-row>
      <v-col
        v-for="errand in errands"
        :key="errand.id"
        cols="12"
        md="4"
        sm="6"
      >
        <errand-card :errand="errand" :now="now" show-status>
          <template v-if="tab === 'requested' && view === 'past'" #actions>
            <v-btn
              color="primary"
              prepend-icon="mdi-repeat"
              size="small"
              variant="tonal"
              @click.prevent.stop="reorder(errand)"
            >
              Reorder
            </v-btn>
          </template>
        </errand-card>
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
  import { useRoute, useRouter } from 'vue-router'
  import { listOrders, type Order } from '@/api/order'
  import ErrandCard from '@/components/ErrandCard.vue'
  import { useAlertStore } from '@/stores/alerts'
  import { useClock, useExpiryReload } from '@/util/clock'
  import { ACTIVE_STATUSES, apiErrorMessage, PAST_STATUSES } from '@/util/order'

  // active errands change as the other side acts, so the list refreshes itself
  const REFRESH_MS = 30_000

  type Tab = 'requested' | 'delivering'
  type View = 'active' | 'past'

  const route = useRoute()
  const router = useRouter()
  const alertStore = useAlertStore()

  // tab, view and page live in the URL (?tab=delivering&view=past&page=2), so Back returns to the same list
  const tab = ref<Tab>(route.query.tab === 'delivering' ? 'delivering' : 'requested')
  const view = ref<View>(route.query.view === 'past' ? 'past' : 'active')
  const page = ref(Math.max(1, Number(route.query.page) || 1))

  const errands = ref<Order[]>([])
  const isLoading = ref(false)
  const total = ref(0)
  const totalPage = ref(0)
  // ticks every second for the "expires in" countdown
  const now = useClock()

  const emptyText = computed(() => {
    if (tab.value === 'requested') {
      return view.value === 'active' ? 'Errands you request show up here while they are in progress.' : 'Your completed, cancelled and expired requests show up here.'
    }
    return view.value === 'active' ? 'Errands you accept as a courier show up here while you deliver them.' : 'Errands you have delivered (or that were cancelled) show up here.'
  })

  // ignore responses from requests superseded by a newer one
  let latestRequest = 0

  async function loadErrands () {
    const request = ++latestRequest
    isLoading.value = true
    try {
      const result = await listOrders({
        scope: tab.value,
        statuses: view.value === 'active' ? ACTIVE_STATUSES : PAST_STATUSES,
        page: page.value,
      })
      if (request !== latestRequest) {
        return
      }
      errands.value = result.data
      total.value = result.pagination.total
      totalPage.value = result.pagination.totalPage
    } catch (error) {
      console.error('Error loading my errands', error)
      if (request === latestRequest) {
        alertStore.error(apiErrorMessage(error, 'Could not load your errands'))
      }
    } finally {
      if (request === latestRequest) {
        isLoading.value = false
      }
    }
  }

  // a past errand opens the request form pre-filled with its details
  function reorder (errand: Order) {
    router.push({ name: 'request-errand', query: { from: errand.id } })
  }

  // switching tab or view starts again from page 1
  watch([tab, view], () => {
    if (page.value === 1) {
      loadErrands()
    } else {
      // the page watcher does the loading
      page.value = 1
    }
  })
  watch(page, () => {
    loadErrands()
    window.scrollTo({ top: 0, behavior: 'smooth' })
  })
  // keep the URL in sync without adding history entries
  watch([tab, view, page], () => {
    router.replace({ query: { tab: tab.value, view: view.value, page: page.value > 1 ? String(page.value) : undefined } })
  })

  const timer = setInterval(() => {
    if (view.value === 'active' && document.visibilityState === 'visible' && !isLoading.value) {
      loadErrands()
    }
  }, REFRESH_MS)
  onUnmounted(() => clearInterval(timer))

  // when an active errand expires, reload so it moves from Active to Past straight away
  useExpiryReload(() => errands.value, loadErrands)

  onMounted(loadErrands)
</script>
