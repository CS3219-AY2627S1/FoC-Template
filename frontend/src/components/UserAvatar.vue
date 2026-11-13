<!-- A user's initial in a coloured circle; the colour comes from the name, so a user always gets the same one.
     Stands in for profile pictures, which users cannot upload yet -->
<template>
  <v-avatar :color="color" :size="size">
    <span class="text-white font-weight-medium">{{ initial }}</span>
  </v-avatar>
</template>

<script lang="ts" setup>
  import { computed } from 'vue'

  const props = withDefaults(defineProps<{
    name: string
    size?: number
  }>(), { size: 40 })

  const COLORS = ['indigo', 'teal', 'deep-orange', 'purple', 'blue-grey', 'green', 'pink', 'brown']

  const initial = computed(() => props.name.trim().charAt(0).toUpperCase() || '?')
  const color = computed(() => {
    let hash = 0
    for (const char of props.name) {
      hash = (hash * 31 + (char.codePointAt(0) ?? 0)) % 1_000_003
    }
    return COLORS[hash % COLORS.length]
  })
</script>
