<template>
  <v-app>
    <v-main>
      <router-view />
    </v-main>
    <global-alerts/>
  </v-app>
</template>

<script lang="ts" setup>
import GlobalAlerts from '@/components/GlobalAlerts.vue';
</script>
