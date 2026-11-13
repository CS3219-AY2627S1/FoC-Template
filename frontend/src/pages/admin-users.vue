<!-- Admin only: every user, each linking to their errand history -->
<template>
  <v-container class="py-6" max-width="1000">
    <div class="d-flex flex-wrap align-center justify-space-between ga-2 mb-4">
      <h1 class="text-h5 font-weight-bold">Users</h1>

      <span v-if="!isLoading" class="text-body-2 text-medium-emphasis">
        {{ users.length }}{{ nextCursor === null ? '' : '+' }} user{{ users.length === 1 && nextCursor === null ? '' : 's' }}
      </span>
    </div>

    <v-skeleton-loader v-if="isLoading" type="list-item-avatar-two-line@6" />

    <v-empty-state
      v-else-if="users.length === 0"
      icon="mdi-account-group-outline"
      text="Users show up here once they register."
      title="No users yet"
    />

    <!-- One row per user, in the order they joined; opens their errand history -->
    <v-card v-else rounded="lg" variant="outlined">
      <v-list lines="two">
        <template v-for="(user, i) in users" :key="user.id">
          <v-divider v-if="i > 0" />

          <v-list-item :to="{ name: 'admin-user', params: { id: user.id } }">
            <template #prepend>
              <user-avatar :name="user.nickname" />
            </template>

            <v-list-item-title class="d-flex flex-wrap align-center ga-2">
              {{ user.nickname }}
              <span class="text-caption text-medium-emphasis">#{{ user.id }}</span>
              <v-chip v-if="user.roles.includes('admin')" color="primary" label size="x-small">Admin</v-chip>
              <v-chip v-if="user.isSuspended" color="error" label size="x-small">Suspended</v-chip>
            </v-list-item-title>

            <v-list-item-subtitle>
              {{ user.email }}<span v-if="user.contact"> · {{ user.contact }}</span>
            </v-list-item-subtitle>

            <template #append>
              <span class="text-caption text-medium-emphasis d-none d-sm-inline">Joined {{ formatDate(user.createdAt) }}</span>
              <v-icon class="ml-2" color="grey">mdi-chevron-right</v-icon>
            </template>
          </v-list-item>
        </template>
      </v-list>
    </v-card>

    <!-- The user service sends 20 users at a time -->
    <div v-if="nextCursor !== null" class="d-flex justify-center mt-4">
      <v-btn :loading="isLoadingMore" prepend-icon="mdi-chevron-down" variant="tonal" @click="loadMore">Load more</v-btn>
    </div>
  </v-container>
</template>

<script lang="ts" setup>
  import { onMounted, ref } from 'vue'
  import { listUsers, type UserSummary } from '@/api/user'
  import UserAvatar from '@/components/UserAvatar.vue'
  import { useAlertStore } from '@/stores/alerts'
  import { apiErrorMessage } from '@/util/order'
  import { formatDate } from '@/util/user'

  const alertStore = useAlertStore()

  const users = ref<UserSummary[]>([])
  // where the next page starts, or null once every user is loaded
  const nextCursor = ref<number | null>(null)
  const isLoading = ref(true)
  const isLoadingMore = ref(false)

  // appends the next page of users (the first page when cursor is left out)
  async function loadPage (cursor?: number) {
    const page = await listUsers(cursor)
    users.value = [...users.value, ...page.data]
    nextCursor.value = page.pagination.nextCursor
  }

  async function loadMore () {
    if (nextCursor.value === null || isLoadingMore.value) {
      return
    }
    isLoadingMore.value = true
    try {
      await loadPage(nextCursor.value)
    } catch (error) {
      console.error('Error loading more users', error)
      alertStore.error(apiErrorMessage(error, 'Could not load more users'))
    } finally {
      isLoadingMore.value = false
    }
  }

  onMounted(async () => {
    try {
      await loadPage()
    } catch (error) {
      console.error('Error loading users', error)
      alertStore.error(apiErrorMessage(error, 'Could not load users'))
    } finally {
      isLoading.value = false
    }
  })
</script>
