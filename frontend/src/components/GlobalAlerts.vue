<template>
  <v-snackbar-queue
    v-model="notifications.queue"
    :total-visible="10"
    display-strategy="overflow"
    location="bottom end"
    closable
  />
</template>

<script setup lang="ts">
import { useAlertStore } from '@/stores/alerts';
const notifications = useAlertStore();
</script>
