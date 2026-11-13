<!-- One chat, full page: the conversation for an errand between its requester and courier -->
<template>
  <v-container class="py-6" max-width="900">
    <v-btn class="mb-4" prepend-icon="mdi-arrow-left" :to="{ name: 'chats' }" variant="text">All chats</v-btn>

    <chat-panel :errand-id="errandId" />
  </v-container>
</template>

<script lang="ts" setup>
  import { computed } from 'vue'
  import { useRoute } from 'vue-router'
  import ChatPanel from '@/components/ChatPanel.vue'

  const route = useRoute()
  const errandId = computed(() => route.params.errandId as string)
</script>
