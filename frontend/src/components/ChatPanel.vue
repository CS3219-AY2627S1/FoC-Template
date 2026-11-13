<!-- The conversation for one errand between its requester and courier: history, live messages, text and images -->
<template>
  <v-card class="chat-panel d-flex flex-column" rounded="lg" variant="outlined">
    <v-progress-linear v-if="isLoading" color="primary" indeterminate />

    <!-- Chat is gone or was never ours: the service answers 404 for both -->
    <v-empty-state
      v-if="!isLoading && notFound"
      icon="mdi-chat-remove-outline"
      :text="wasDeleted
        ? 'This chat was deleted after the errand ended.'
        : 'There is no chat for this errand. A chat opens when a courier accepts the errand, and only its requester and courier can see it.'"
      title="Chat not available"
    />

    <template v-else-if="chat">
      <!-- Who you are talking to -->
      <div class="d-flex align-center ga-3 px-4 py-3 border-b">
        <user-avatar :name="otherLabel" :size="36" />

        <div class="flex-grow-1">
          <div class="font-weight-medium">{{ otherLabel }}</div>
          <div class="text-caption text-medium-emphasis">{{ otherRole }}</div>
        </div>

        <v-btn
          v-if="showErrandLink"
          prepend-icon="mdi-package-variant"
          size="small"
          :to="{ name: 'errand', params: { id: errandId } }"
          variant="text"
        >
          Errand
        </v-btn>
      </div>

      <!-- The errand has ended: the chat stays usable until it is deleted -->
      <v-alert
        v-if="chat.endReason"
        class="ma-3 mb-0"
        density="compact"
        icon="mdi-timer-sand"
        :text="endedText"
        type="info"
        variant="tonal"
      />

      <!-- Messages, oldest at the top -->
      <div ref="scroller" class="chat-messages flex-grow-1 pa-3" @scroll="onScroll">
        <div v-if="hasMore" class="d-flex justify-center mb-3">
          <v-btn :loading="isLoadingOlder" size="small" variant="tonal" @click="loadOlder">Load older messages</v-btn>
        </div>

        <div v-if="messages.length === 0" class="text-center text-medium-emphasis text-body-2 py-8">
          No messages yet. Say hello!
        </div>

        <div
          v-for="message in messages"
          :key="message.clientMessageId"
          class="d-flex mb-2"
          :class="isMine(message) ? 'justify-end' : 'justify-start'"
        >
          <div class="bubble" :class="isMine(message) ? 'bubble-mine' : 'bubble-theirs'">
            <img
              v-if="message.type === 'IMAGE'"
              alt="Image sent in chat"
              class="bubble-image"
              :src="message.localImage ?? imageSrc(message) ?? ''"
              @click="viewing = message.localImage ?? imageSrc(message)"
            >

            <div v-else class="bubble-text">{{ message.body }}</div>

            <div class="bubble-meta">
              <template v-if="message.failed">
                <span class="text-error">Not sent</span>

                <v-btn
                  class="ml-1"
                  density="compact"
                  size="x-small"
                  variant="text"
                  @click="retry(message)"
                >Retry</v-btn>
              </template>

              <span v-else-if="message.pending">Sending…</span>
              <span v-else :title="formatDateTime(message.createdAt)">{{ formatTime(message.createdAt) }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Write a message -->
      <v-form class="d-flex align-end ga-2 pa-3 border-t" @submit.prevent="sendTextMessage">
        <input
          ref="fileInput"
          :accept="IMAGE_TYPES.join(',')"
          class="d-none"
          type="file"
          @change="onImagePicked"
        >

        <v-btn
          aria-label="Send an image"
          icon="mdi-image-outline"
          variant="text"
          @click="fileInput?.click()"
        />

        <v-textarea
          v-model="draft"
          auto-grow
          class="flex-grow-1"
          :counter="draft.length > MAX_TEXT_LENGTH - 200 ? MAX_TEXT_LENGTH : undefined"
          density="compact"
          hide-details="auto"
          max-rows="5"
          :maxlength="MAX_TEXT_LENGTH"
          placeholder="Type a message"
          rows="1"
          variant="outlined"
          @keydown.enter.exact.prevent="sendTextMessage"
        />

        <v-btn
          aria-label="Send"
          color="primary"
          :disabled="draft.trim().length === 0"
          icon="mdi-send"
          type="submit"
          variant="flat"
        />
      </v-form>
    </template>

    <!-- Full-size image -->
    <v-dialog max-width="900" :model-value="viewing !== null" @update:model-value="viewing = null">
      <v-card rounded="lg">
        <img v-if="viewing" alt="Image sent in chat" class="w-100" :src="viewing">

        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="viewing = null">Close</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-card>
</template>

<script lang="ts" setup>
  import axios from 'axios'
  import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
  import {
    type ChatEvent,
    type ChatMessage,
    type ChatSummary,
    getChat,
    IMAGE_TYPES,
    imageSrc,
    listMessages,
    markRead,
    MAX_IMAGE_BYTES,
    MAX_TEXT_LENGTH,
    sendImage,
    sendText,
  } from '@/api/chat'
  import UserAvatar from '@/components/UserAvatar.vue'
  import { useAlertStore } from '@/stores/alerts'
  import { useAuthStore } from '@/stores/auth'
  import { useChatStore } from '@/stores/chat'
  import { apiErrorMessage, formatDateTime, personLabel } from '@/util/order'

  const props = withDefaults(defineProps<{
    errandId: string
    // hide the link back to the errand when the panel is already on the errand page
    showErrandLink?: boolean
  }>(), { showErrandLink: true })

  const PAGE_SIZE = 30
  // scrolled this close to the bottom counts as "at the bottom", so new messages scroll into view
  const STICK_TO_BOTTOM_PX = 120

  // a message as shown: a sent one from the server, or one of ours still on its way
  interface ShownMessage extends ChatMessage {
    pending?: boolean
    failed?: boolean
    // our own image before the upload finishes, and the file to retry with
    localImage?: string
    file?: File
  }

  const auth = useAuthStore()
  const alertStore = useAlertStore()
  const chatStore = useChatStore()

  const chat = ref<ChatSummary | null>(null)
  const messages = ref<ShownMessage[]>([])
  const hasMore = ref(false)
  const isLoading = ref(true)
  const isLoadingOlder = ref(false)
  const notFound = ref(false)
  const wasDeleted = ref(false)
  const draft = ref('')
  const viewing = ref<string | null>(null)
  const scroller = ref<HTMLElement | null>(null)
  const fileInput = ref<HTMLInputElement | null>(null)
  let atBottom = true

  const myId = computed(() => auth.userId === null ? null : Number(auth.userId))
  const amRequester = computed(() => chat.value?.requesterId === myId.value)
  const otherLabel = computed(() => personLabel(chat.value?.otherUserId ?? null, myId.value))
  const otherRole = computed(() => amRequester.value ? 'Your courier' : 'Requester')
  const endedText = computed(() => {
    const c = chat.value
    if (!c?.endReason) {
      return ''
    }
    const how = c.endReason === 'DELIVERED' ? 'was delivered' : 'was cancelled or expired'
    return c.deleteAt
      ? `This errand ${how}. The chat and its images are deleted at ${formatDateTime(c.deleteAt)}.`
      : `This errand ${how}.`
  })

  function isMine (message: ChatMessage): boolean {
    return message.senderId === myId.value
  }

  // e.g. "14:05"
  function formatTime (iso: string): string {
    return new Date(iso).toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit' })
  }

  function onScroll () {
    const el = scroller.value
    if (el) {
      atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_TO_BOTTOM_PX
    }
  }

  async function scrollToBottom (force = false) {
    await nextTick()
    const el = scroller.value
    if (el && (force || atBottom)) {
      el.scrollTop = el.scrollHeight
      atBottom = true
    }
  }

  // adds or replaces a message, matched by clientMessageId so our own sends are not shown twice
  function putMessage (message: ShownMessage) {
    const index = messages.value.findIndex(m => m.clientMessageId === message.clientMessageId)
    if (index === -1) {
      messages.value = [...messages.value, message]
    } else {
      const local = messages.value[index]!
      if (local.localImage && !message.localImage) {
        URL.revokeObjectURL(local.localImage)
      }
      const copy = [...messages.value]
      copy[index] = message
      messages.value = copy
    }
  }

  // the server has seen everything we have shown
  async function readAll () {
    chatStore.clearUnread(props.errandId)
    if (chat.value && chat.value.unreadCount > 0) {
      chat.value = { ...chat.value, unreadCount: 0 }
    }
    try {
      await markRead(props.errandId)
    } catch (error) {
      console.warn('Could not mark the chat as read', error)
    }
  }

  async function load () {
    isLoading.value = true
    notFound.value = false
    wasDeleted.value = false
    messages.value = []
    try {
      const [summary, page] = await Promise.all([
        getChat(props.errandId),
        listMessages(props.errandId, { limit: PAGE_SIZE }),
      ])
      chat.value = summary
      messages.value = page.data
      hasMore.value = page.hasMore
      await scrollToBottom(true)
      void readAll()
    } catch (error) {
      chat.value = null
      const status = axios.isAxiosError(error) ? error.response?.status : undefined
      if (status === 404) {
        notFound.value = true
      } else {
        console.error('Error loading chat', error)
        alertStore.error(apiErrorMessage(error, 'Could not load the chat'))
      }
    } finally {
      isLoading.value = false
    }
  }

  async function loadOlder () {
    const oldest = messages.value.find(m => !m.pending && !m.failed)
    if (!oldest || isLoadingOlder.value) {
      return
    }
    isLoadingOlder.value = true
    const el = scroller.value
    const heightBefore = el?.scrollHeight ?? 0
    try {
      const page = await listMessages(props.errandId, { limit: PAGE_SIZE, before: oldest.id })
      messages.value = [...page.data, ...messages.value]
      hasMore.value = page.hasMore
      // keep the message the user was looking at in place
      await nextTick()
      if (el) {
        el.scrollTop += el.scrollHeight - heightBefore
      }
    } catch (error) {
      alertStore.error(apiErrorMessage(error, 'Could not load older messages'))
    } finally {
      isLoadingOlder.value = false
    }
  }

  // keeps the chat list (and its preview) in step with a message we sent or received here
  function noteInList (message: ChatMessage) {
    if (chat.value) {
      chat.value = { ...chat.value, lastMessage: message }
      chatStore.noteMessage({ ...chat.value, unreadCount: 0 })
    }
  }

  async function deliver (message: ShownMessage) {
    putMessage({ ...message, pending: true, failed: false })
    await scrollToBottom(true)
    try {
      const saved = message.type === 'IMAGE'
        ? await sendImage(props.errandId, message.file!, message.clientMessageId)
        : await sendText(props.errandId, message.body ?? '', message.clientMessageId)
      putMessage(saved)
      noteInList(saved)
    } catch (error) {
      const status = axios.isAxiosError(error) ? error.response?.status : undefined
      if (status === 404) {
        // the chat was deleted meanwhile
        notFound.value = true
        wasDeleted.value = true
        return
      }
      if (status !== undefined && [400, 413, 415].includes(status)) {
        // the server will never accept this one, so do not offer a retry
        messages.value = messages.value.filter(m => m.clientMessageId !== message.clientMessageId)
        alertStore.error(apiErrorMessage(error, 'Could not send the message'))
        return
      }
      putMessage({ ...message, pending: false, failed: true })
    }
  }

  function newMessage (fields: Pick<ShownMessage, 'type' | 'body' | 'localImage' | 'file'>): ShownMessage {
    return {
      id: 0,
      errandId: props.errandId,
      senderId: myId.value ?? 0,
      imageUrl: null,
      // the same id is sent again on retry, so the server never saves it twice
      clientMessageId: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      ...fields,
    }
  }

  function sendTextMessage () {
    const body = draft.value.trim()
    if (!body) {
      return
    }
    draft.value = ''
    void deliver(newMessage({ type: 'TEXT', body }))
  }

  function onImagePicked (event: Event) {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    // allow picking the same file again later
    input.value = ''
    if (!file) {
      return
    }
    if (!IMAGE_TYPES.includes(file.type)) {
      alertStore.error('Only JPEG, PNG or WebP images can be sent')
      return
    }
    if (file.size > MAX_IMAGE_BYTES) {
      alertStore.error(`Images must be at most ${MAX_IMAGE_BYTES / 1024 / 1024} MB`)
      return
    }
    void deliver(newMessage({ type: 'IMAGE', body: null, localImage: URL.createObjectURL(file), file }))
  }

  function retry (message: ShownMessage) {
    void deliver(message)
  }

  function onPush (event: ChatEvent) {
    switch (event.type) {
      case 'message': {
        if (event.message.errandId !== props.errandId) {
          return
        }
        putMessage(event.message)
        if (chat.value) {
          chat.value = { ...chat.value, lastMessage: event.message }
        }
        void scrollToBottom(isMine(event.message))
        if (!isMine(event.message)) {
          void readAll()
        }
        break
      }
      case 'chat.opened':
      case 'chat.updated': {
        if (event.chat.errandId === props.errandId) {
          chat.value = event.chat
        }
        break
      }
      case 'chat.deleted': {
        if (event.errandId === props.errandId) {
          chat.value = null
          notFound.value = true
          wasDeleted.value = true
        }
        break
      }
    }
  }

  const unsubscribe = chatStore.subscribe(onPush)

  watch(() => props.errandId, id => {
    chatStore.activeErrandId = id
    void load()
  })

  onMounted(() => {
    chatStore.activeErrandId = props.errandId
    void load()
  })

  onUnmounted(() => {
    unsubscribe()
    if (chatStore.activeErrandId === props.errandId) {
      chatStore.activeErrandId = null
    }
    for (const m of messages.value) {
      if (m.localImage) {
        URL.revokeObjectURL(m.localImage)
      }
    }
  })
</script>

<style scoped>
.chat-panel {
  height: min(70vh, 720px);
  min-height: 420px;
}

.chat-messages {
  overflow-y: auto;
}

.bubble {
  max-width: min(75%, 520px);
  padding: 8px 12px;
  border-radius: 14px;
  word-break: break-word;
}

.bubble-mine {
  background: rgb(var(--v-theme-primary));
  color: rgb(var(--v-theme-on-primary));
  border-bottom-right-radius: 4px;
}

.bubble-theirs {
  background: rgba(var(--v-theme-on-surface), 0.08);
  border-bottom-left-radius: 4px;
}

.bubble-text {
  white-space: pre-wrap;
}

.bubble-image {
  display: block;
  max-width: 100%;
  max-height: 280px;
  border-radius: 8px;
  cursor: zoom-in;
}

.bubble-meta {
  margin-top: 2px;
  font-size: 0.7rem;
  opacity: 0.75;
  text-align: right;
}
</style>
