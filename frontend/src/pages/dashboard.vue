<template>
  <v-container class="py-6" max-width="1200">
    <h1 class="text-h5 font-weight-bold mb-1">Dashboard</h1>

    <p class="text-body-2 text-medium-emphasis mb-4">
      Your errands in progress, as a requester and as a courier.
    </p>

    <!-- Quick actions -->
    <v-row class="mb-2" dense>
      <v-col cols="12" sm="4">
        <v-card
          class="h-full"
          color="primary"
          rounded="lg"
          :to="{ name: 'request-errand' }"
          variant="flat"
        >
          <v-card-item prepend-icon="mdi-plus-box-outline" subtitle="Get something collected for you" title="Request Errand" />
        </v-card>
      </v-col>

      <v-col cols="12" sm="4">
        <v-card class="h-full" rounded="lg" :to="{ name: 'open-errands' }" variant="tonal">
          <v-card-item
            prepend-icon="mdi-bike-fast"
            :subtitle="openCount === null ? 'Deliver for others and earn credits' : `${openCount} waiting for a courier`"
            title="Open Errands"
          />
        </v-card>
      </v-col>

      <v-col cols="12" sm="4">
        <v-card class="h-full" rounded="lg" :to="{ name: 'my-errands' }" variant="tonal">
          <v-card-item prepend-icon="mdi-clipboard-list-outline" subtitle="Everything you requested or delivered" title="My Errands" />
        </v-card>
      </v-col>
    </v-row>

    <!-- Credits: what the user can spend, and what is held for errands they requested -->
    <section>
      <h2 class="text-h6 mb-2">Credits</h2>

      <v-skeleton-loader v-if="credits.balance === null && !credits.problem" type="card" />

      <v-card v-else-if="credits.problem" class="pa-4 text-medium-emphasis" rounded="lg" variant="outlined">
        {{ credits.problem === 'missing'
          ? 'You do not have a credit account yet. It is created when you register; try again shortly.'
          : 'Could not load your credits right now. Try again later.' }}
      </v-card>

      <v-card v-else rounded="lg" variant="outlined">
        <v-row class="pa-2" dense>
          <v-col cols="6">
            <v-card-item prepend-icon="mdi-hand-coin-outline" subtitle="Available to spend">
              <v-card-title class="text-h4 font-weight-bold">{{ credits.balance }}</v-card-title>
            </v-card-item>
          </v-col>

          <v-col cols="6">
            <v-card-item prepend-icon="mdi-lock-clock" subtitle="On hold for your errands">
              <v-card-title class="text-h4 font-weight-bold">{{ credits.onHold }}</v-card-title>
            </v-card-item>
          </v-col>
        </v-row>

        <template v-if="credits.activeHolds.length > 0">
          <v-divider />

          <v-list density="compact">
            <v-list-subheader>Held until each errand is completed (paid to the courier) or cancelled (refunded to you)</v-list-subheader>

            <v-list-item
              v-for="hold in credits.activeHolds"
              :key="hold.errandId"
              prepend-icon="mdi-package-variant"
              :title="`Errand #${hold.errandId}`"
            >
              <template #append>
                <span class="font-weight-medium">{{ hold.amount }} credit{{ hold.amount === 1 ? '' : 's' }}</span>
              </template>
            </v-list-item>
          </v-list>
        </template>
      </v-card>
    </section>

    <!-- My active errands, one section per role -->
    <section v-for="section in sections" :key="section.tab" class="mt-6">
      <div class="d-flex align-center justify-space-between mb-2">
        <h2 class="text-h6">
          {{ section.title }}
          <span v-if="!isLoading" class="text-medium-emphasis">({{ section.total }})</span>
        </h2>

        <v-btn
          v-if="section.total > 0"
          size="small"
          :to="{ name: 'my-errands', query: { tab: section.tab, view: 'active' } }"
          variant="text"
        >
          See all
        </v-btn>
      </div>

      <v-skeleton-loader v-if="isLoading" type="card" />

      <v-card v-else-if="section.errands.length === 0" class="pa-4 text-medium-emphasis" rounded="lg" variant="outlined">
        {{ section.empty }}
      </v-card>

      <v-row v-else>
        <v-col
          v-for="errand in section.errands"
          :key="errand.id"
          cols="12"
          md="4"
          sm="6"
        >
          <errand-card :errand="errand" :now="now" show-status />
        </v-col>
      </v-row>
    </section>
  </v-container>
</template>

<script lang="ts" setup>
  import { onMounted, onUnmounted, ref } from 'vue'
  import { useCreditStore } from '@/stores/credit'
  import { listOrders, type Order } from '@/api/order'
  import ErrandCard from '@/components/ErrandCard.vue'
  import { useClock, useExpiryReload } from '@/util/clock'
  import { ACTIVE_STATUSES } from '@/util/order'

  // loaded and kept fresh by the app bar
  const credits = useCreditStore()

  // keep the overview current as couriers and requesters act
  const REFRESH_MS = 30_000
  // cards shown per section; "See all" opens the full list
  const PREVIEW_COUNT = 6

  interface Section {
    tab: 'requested' | 'delivering'
    title: string
    empty: string
    errands: Order[]
    total: number
  }

  const sections = ref<Section[]>([
    { tab: 'requested', title: 'You requested', empty: 'No errands in progress. Request one when you need something collected.', errands: [], total: 0 },
    { tab: 'delivering', title: 'You\'re delivering', empty: 'You are not delivering anything right now. Browse open errands to earn credits.', errands: [], total: 0 },
  ])
  const openCount = ref<number | null>(null)
  const isLoading = ref(true)
  // ticks every second for the "expires in" countdown
  const now = useClock()

  async function loadOverview () {
    try {
      const [requested, delivering, open] = await Promise.all([
        listOrders({ scope: 'requested', statuses: ACTIVE_STATUSES, page: 1 }),
        listOrders({ scope: 'delivering', statuses: ACTIVE_STATUSES, page: 1 }),
        listOrders({ scope: 'open', page: 1 }),
      ])
      for (const [section, result] of [[sections.value[0]!, requested], [sections.value[1]!, delivering]] as const) {
        section.errands = result.data.slice(0, PREVIEW_COUNT)
        section.total = result.pagination.total
      }
      openCount.value = open.pagination.total
    } catch (error) {
      // the overview is best effort; each list page shows its own errors
      console.error('Error loading dashboard', error)
    } finally {
      isLoading.value = false
    }
  }

  const timer = setInterval(() => {
    if (document.visibilityState === 'visible') {
      loadOverview()
    }
  }, REFRESH_MS)
  onUnmounted(() => clearInterval(timer))

  // when a shown errand expires, reload so it drops out of the overview straight away
  useExpiryReload(() => sections.value.flatMap(s => s.errands), loadOverview)

  onMounted(loadOverview)
</script>