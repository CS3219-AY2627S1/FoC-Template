<template>
  <!-- Show the supplier's image if it has one -->
  <v-img
    v-if="supplier.imageUrl"
    class="bg-grey-lighten-3"
    cover
    :height="height"
    :src="supplier.imageUrl"
  >
    <!-- Show placeholder icon if the image fails to load (e.g. broken link) -->
    <template #error>
      <div class="d-flex fill-height align-center justify-center">
        <v-icon color="grey" size="48">{{ placeholderIcon }}</v-icon>
      </div>
    </template>
  </v-img>

  <!-- Show placeholder icon if the supplier has no image -->
  <div
    v-else
    class="d-flex align-center justify-center bg-grey-lighten-3"
    :style="{ height: `${height}px` }"
  >
    <v-icon color="grey" size="48">{{ placeholderIcon }}</v-icon>
  </div>
</template>

<script lang="ts" setup>
  import type { Supplier } from '@/api/supplier'
  import { computed } from 'vue'
  import { supplierTypeInfo } from '@/util/supplier'

  const props = defineProps<{ supplier: Supplier, height: number }>()

  const placeholderIcon = computed(() => {
    const type = props.supplier.type[0]
    return type ? supplierTypeInfo[type].icon : 'mdi-store-outline'
  })
</script>
