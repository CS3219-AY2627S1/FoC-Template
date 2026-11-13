<!-- Admin only: one user's details and their errand history, as requester and as courier -->
<template>
  <v-container class="py-6" max-width="1200">
    <v-btn class="mb-4" prepend-icon="mdi-arrow-left" :to="{ name: 'admin-users' }" variant="text">All users</v-btn>

    <v-skeleton-loader v-if="isLoadingUser" class="mb-4" type="list-item-avatar-three-line" />

    <v-empty-state
      v-else-if="!user"
      icon="mdi-account-off-outline"
      text="This user may not exist."
      title="User not found"
    />

    <template v-else>
      <!-- Who they are -->
      <v-card class="mb-6" rounded="lg" variant="outlined">
        <v-card-item>
          <template #prepend>
            <user-avatar :name="user.nickname" :size="56" />
          </template>

          <v-card-title class="d-flex flex-wrap align-center ga-2">
            {{ user.nickname }}
            <span class="text-body-2 text-medium-emphasis">#{{ user.id }}</span>
            <v-chip v-if="isAdmin" color="primary" label size="x-small">Admin</v-chip>
            <v-chip v-if="user.isSuspended" color="error" label size="x-small">Suspended</v-chip>
          </v-card-title>

          <v-card-subtitle class="text-wrap">
            {{ user.email }}<span v-if="user.contact"> · {{ user.contact }}</span>
            <span v-if="user.createdAt"> · Joined {{ formatDate(user.createdAt) }}</span>
          </v-card-subtitle>
        </v-card-item>

        <!-- Admin actions; the user service refuses them on your own account, so they are hidden there -->
        <v-card-actions v-if="!isSelf" class="flex-wrap ga-2 px-4 pb-4">
          <v-btn
            :prepend-icon="isAdmin ? 'mdi-shield-remove-outline' : 'mdi-shield-account-outline'"
            variant="tonal"
            @click="pending = isAdmin ? 'demote' : 'promote'"
          >
            {{ isAdmin ? 'Remove admin' : 'Make admin' }}
          </v-btn>

          <v-btn
            :color="user.isSuspended ? 'success' : 'error'"
            :prepend-icon="user.isSuspended ? 'mdi-account-check-outline' : 'mdi-account-cancel-outline'"
            variant="tonal"
            @click="pending = user.isSuspended ? 'unsuspend' : 'suspend'"
          >
            {{ user.isSuspended ? 'Unsuspend' : 'Suspend' }}
          </v-btn>
        </v-card-actions>
      </v-card>

      <!-- Confirms the chosen admin action -->
      <v-dialog max-width="440" :model-value="pending !== null" @update:model-value="value => { if (!value && !isActing) pending = null }">
        <v-card v-if="pending" rounded="lg">
          <v-card-title class="text-wrap">{{ ACTIONS[pending].title(user.nickname) }}</v-card-title>
          <v-card-text>{{ ACTIONS[pending].text }}</v-card-text>

          <v-card-actions>
            <v-spacer />
            <v-btn :disabled="isActing" variant="text" @click="pending = null">Cancel</v-btn>

            <v-btn :color="ACTIONS[pending].color" :loading="isActing" variant="flat" @click="confirmAction">
              {{ ACTIONS[pending].confirm }}
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-dialog>

      <!-- Their errands as requester or as courier -->
      <v-tabs v-model="tab" class="mb-4" color="primary">
        <v-tab prepend-icon="mdi-account-arrow-right-outline" value="requested">Requested</v-tab>
        <v-tab prepend-icon="mdi-bike-fast" value="delivering">Delivering</v-tab>
      </v-tabs>

      <!-- Active (still in progress) or Past (delivered, cancelled, expired) -->
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

      <v-empty-state
        v-if="!isLoading && errands.length === 0"
        :icon="tab === 'requested' ? 'mdi-package-variant' : 'mdi-bike-fast'"
        :text="`${user.nickname} has no ${view} errands as ${tab === 'requested' ? 'a requester' : 'a courier'}.`"
        :title="`No ${view} errands`"
      />

      <v-row>
        <v-col
          v-for="errand in errands"
          :key="errand.id"
          cols="12"
          md="4"
          sm="6"
        >
          <errand-card :errand="errand" :now="now" show-status />
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
    </template>
  </v-container>
</template>

<script lang="ts" setup>
  import axios from 'axios'
  import { computed, onMounted, ref, watch } from 'vue'
  import { useRoute } from 'vue-router'
  import { refreshOnce } from '@/api/http'
  import { listOrders, type Order } from '@/api/order'
  import { getUserSummary, setSuspended, updateRoles, type UserSummary } from '@/api/user'
  import ErrandCard from '@/components/ErrandCard.vue'
  import UserAvatar from '@/components/UserAvatar.vue'
  import { useAlertStore } from '@/stores/alerts'
  import { useAuthStore } from '@/stores/auth'
  import { useClock } from '@/util/clock'
  import { ACTIVE_STATUSES, apiErrorMessage, PAST_STATUSES } from '@/util/order'
  import { formatDate } from '@/util/user'

  const route = useRoute()
  const alertStore = useAlertStore()
  const userId = Number(route.params.id)

  const user = ref<UserSummary | null>(null)
  const isLoadingUser = ref(true)

  const auth = useAuthStore()
  const isSelf = computed(() => auth.userId !== null && Number(auth.userId) === userId)
  const isAdmin = computed(() => user.value?.roles?.includes('admin') ?? false)

  type AdminAction = 'promote' | 'demote' | 'suspend' | 'unsuspend'

  // what each action asks before it runs, and what it says once done
  const ACTIONS: Record<AdminAction, { title: (name: string) => string, text: string, confirm: string, color: string, done: string }> = {
    promote: {
      title: name => `Make ${name} an admin?`,
      text: 'They will be able to see every user and errand, and suspend or promote other users. It takes effect the next time they log in or their session refreshes.',
      confirm: 'Make admin',
      color: 'primary',
      done: 'is now an admin',
    },
    demote: {
      title: name => `Remove ${name} as admin?`,
      text: 'They lose access to the admin pages the next time they log in or their session refreshes.',
      confirm: 'Remove admin',
      color: 'primary',
      done: 'is no longer an admin',
    },
    suspend: {
      title: name => `Suspend ${name}?`,
      text: 'They will not be able to log in. If they are logged in now, they are signed out when their session next refreshes. Their errands are not changed.',
      confirm: 'Suspend',
      color: 'error',
      done: 'is suspended',
    },
    unsuspend: {
      title: name => `Unsuspend ${name}?`,
      text: 'They will be able to log in again.',
      confirm: 'Unsuspend',
      color: 'success',
      done: 'is no longer suspended',
    },
  }

  const pending = ref<AdminAction | null>(null)
  const isActing = ref(false)

  async function confirmAction () {
    const action = pending.value
    if (!action || !user.value) {
      return
    }
    isActing.value = true
    try {
      await (action === 'promote' || action === 'demote' ? updateRoles(userId, { admin: action === 'promote' }) : setSuspended(userId, action === 'suspend'))
      // reload so the page shows what the user service now holds
      user.value = await getUserSummary(userId)
      alertStore.success(`${user.value.nickname} ${ACTIONS[action].done}`)
      pending.value = null
    } catch (error) {
      console.error(`Error running ${action}`, error)
      alertStore.error(apiErrorMessage(error, 'Could not update this user'))
      // 403: the user service found we are no longer an admin (or are suspended) although our
      // token still says so. Refresh it so the roles match; losing admin leaves the admin pages
      // (see initCredentialWatcher), and a suspended account is logged out
      if (axios.isAxiosError(error) && error.response?.status === 403) {
        pending.value = null
        await refreshOnce().catch(() => {})
      }
    } finally {
      isActing.value = false
    }
  }

  const tab = ref<'requested' | 'delivering'>('requested')
  const view = ref<'active' | 'past'>('active')
  const page = ref(1)
  const errands = ref<Order[]>([])
  const isLoading = ref(false)
  const total = ref(0)
  const totalPage = ref(0)
  // ticks every second for the countdowns on active errands
  const now = useClock()

  async function loadUser () {
    try {
      user.value = await getUserSummary(userId)
    } catch (error) {
      // 404 shows the not found state
      const status = axios.isAxiosError(error) ? error.response?.status : undefined
      if (status !== 404) {
        console.error('Error loading user', error)
        alertStore.error(apiErrorMessage(error, 'Could not load this user'))
      }
    } finally {
      isLoadingUser.value = false
    }
  }

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
        userId,
      })
      if (request !== latestRequest) {
        return
      }
      errands.value = result.data
      total.value = result.pagination.total
      totalPage.value = result.pagination.totalPage
    } catch (error) {
      console.error('Error loading user errands', error)
      if (request === latestRequest) {
        alertStore.error(apiErrorMessage(error, 'Could not load this user\'s errands'))
      }
    } finally {
      if (request === latestRequest) {
        isLoading.value = false
      }
    }
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

  onMounted(async () => {
    await loadUser()
    if (user.value) {
      await loadErrands()
    }
  })
</script>
