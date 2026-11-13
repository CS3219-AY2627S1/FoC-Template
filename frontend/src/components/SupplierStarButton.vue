<!-- Adds or removes a supplier from favourites; works inside a card that is itself a link -->
<template>
  <v-btn
    :aria-label="saved ? 'Remove from favourites' : 'Add to favourites'"
    :color="saved ? 'amber-darken-2' : undefined"
    :icon="saved ? 'mdi-star' : 'mdi-star-outline'"
    :loading="isSaving"
    :size="size"
    variant="text"
    @click.prevent.stop="toggle"
  />
</template>

<script lang="ts" setup>
  import { computed, onMounted, ref } from 'vue'
  import { useAlertStore } from '@/stores/alerts'
  import { useFavouriteStore } from '@/stores/favourites'
  import { apiErrorMessage } from '@/util/order'

  const props = withDefaults(defineProps<{
    supplierId: number
    size?: string
  }>(), { size: 'default' })

  const favouriteStore = useFavouriteStore()
  const alertStore = useAlertStore()

  const isSaving = ref(false)
  const saved = computed(() => favouriteStore.supplierFavourite(props.supplierId))

  async function toggle () {
    if (isSaving.value) {
      return
    }
    isSaving.value = true
    try {
      await (saved.value ? favouriteStore.remove(saved.value.id) : favouriteStore.add({ kind: 'SUPPLIER', targetId: props.supplierId }))
    } catch (error) {
      console.error('Error saving supplier', error)
      alertStore.error(apiErrorMessage(error, 'Could not update your favourites'))
    } finally {
      isSaving.value = false
    }
  }

  onMounted(() => void favouriteStore.ensureLoaded())
</script>
