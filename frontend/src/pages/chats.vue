<!-- The signed-in user's chats, one per errand they requested or are delivering, most recently active first -->
<template>
  <v-container class="py-6" max-width="900">
    <div class="d-flex flex-wrap align-center justify-space-between ga-2 mb-1">
      <h1 class="text-h5 font-weight-bold">Chats</h1>

      <v-chip
        :color="chatStore.isConnected ? 'success' : 'grey'"
        label
        :prepend-icon="chatStore.isConnected ? 'mdi-access-point' : 'mdi-access-point-off'"
        size="small"
        variant="tonal"
      >
        {{ chatStore.isConnected ? 'Live' : 'Reconnecting…' }}
      </v-chip>
    </div>

    <p class="text-body-2 text-medium-emphasis mb-4">
      A chat opens when a courier accepts an errand, between its requester and courier. It is deleted a few hours after the errand ends.
    </p>

    <v-skeleton-loader v-if="!chatStore.isLoaded" type="list-item-avatar-two-line@4" />

    <v-alert
      v-else-if="chatStore.loadFailed && chatStore.chats.length === 0"
      text="Could not load your chats. Try again in a moment."
      type="warning"
      variant="tonal"
    />

    <v-empty-state
      v-else-if="chatStore.chats.length === 0"
      icon="mdi-chat-outline"
      text="Chats appear here once a courier accepts one of your errands, or you accept someone else's."
      title="No chats yet"
    >
      <template #actions>
        <v-btn :to="{ name: 'open-errands' }" variant="tonal">Browse Open Errands</v-btn>
      </template>
    </v-empty-state>

    <v-card v-else rounded="lg" variant="outlined">
      <v-list lines="two">
        <template v-for="(chat, i) in chatStore.chats" :key="chat.errandId">
          <v-divider v-if="i > 0" />

          <v-list-item :to="{ name: 'chat', params: { errandId: chat.errandId } }">
            <template #prepend>
              <v-badge color="error" :content="chat.unreadCount" :model-value="chat.unreadCount > 0">
                <user-avatar :name="personLabel(chat.otherUserId, myId)" />
              </v-badge>
            </template>

            <v-list-item-title class="d-flex flex-wrap align-center ga-2">
              <span :class="{ 'font-weight-bold': chat.unreadCount > 0 }">{{ personLabel(chat.otherUserId, myId) }}</span>
              <span class="text-caption text-medium-emphasis">{{ roleOf(chat) }}</span>

              <v-chip v-if="chat.endReason" label size="x-small" variant="tonal">
                {{ chat.endReason === 'DELIVERED' ? 'Delivered' : 'Ended' }}
              </v-chip>
            </v-list-item-title>

            <v-list-item-subtitle>
              <span class="font-weight-medium">{{ errandTitles[chat.errandId] ?? 'Errand' }}</span>
              · {{ preview(chat) }}
            </v-list-item-subtitle>

            <template #append>
              <span v-if="chat.lastMessage" class="text-caption text-medium-emphasis">
                {{ formatWhen(chat.lastMessage.createdAt) }}
              </span>
            </template>
          </v-list-item>
        </template>
      </v-list>
    </v-card>
  </v-container>
</template>

<script lang="ts" setup>
  import type { ChatSummary } from '@/api/chat'
  import { computed, onMounted, ref, watch } from 'vue'
  import { getOrder } from '@/api/order'
  import UserAvatar from '@/components/UserAvatar.vue'
  import { useAuthStore } from '@/stores/auth'
  import { useChatStore } from '@/stores/chat'
  import { personLabel } from '@/util/order'

  const auth = useAuthStore()
  const chatStore = useChatStore()
  const myId = computed(() => auth.userId === null ? null : Number(auth.userId))

  // what each errand is about, e.g. "Iced Americano", fetched once per errand
  const errandTitles = ref<Record<string, string>>({})

  function roleOf (chat: ChatSummary): string {
    return chat.requesterId === myId.value ? 'your courier' : 'requester'
  }

  function preview (chat: ChatSummary): string {
    const m = chat.lastMessage
    if (!m) {
      return 'No messages yet'
    }
    const who = m.senderId === myId.value ? 'You: ' : ''
    return who + (m.type === 'IMAGE' ? 'Image' : m.body ?? '')
  }

  // today: "14:05"; otherwise: "3 Nov"
  function formatWhen (iso: string): string {
    const d = new Date(iso)
    return d.toDateString() === new Date().toDateString()
      ? d.toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit' })
      : d.toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })
  }

  async function loadTitles (chats: ChatSummary[]) {
    for (const chat of chats) {
      if (errandTitles.value[chat.errandId] !== undefined) {
        continue
      }
      // mark it so a second call does not fetch it again
      errandTitles.value[chat.errandId] = 'Errand'
      try {
        const order = await getOrder(chat.errandId)
        errandTitles.value[chat.errandId] = order.itemDescription
      } catch {
        // the errand may be gone; keep the generic title
      }
    }
  }

  watch(() => chatStore.chats, chats => void loadTitles(chats), { immediate: true })

  // the list is kept live by the store; reload it when the page opens to be sure it is current
  onMounted(() => void chatStore.refresh())
</script>
