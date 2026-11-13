<!-- Favourite building spots for an errand form: tap one to fill in the building, floor and room, or favourite the spot typed in -->
<template>
  <div class="mb-4">
    <div v-if="favouriteStore.spots.length > 0" class="d-flex flex-wrap align-center ga-2 mb-2">
      <span class="text-caption text-medium-emphasis">Favourites:</span>

      <v-chip
        v-for="f in favouriteStore.spots"
        :key="f.id"
        :color="isCurrent(f) ? 'primary' : undefined"
        :disabled="disabled || !f.location"
        prepend-icon="mdi-star"
        size="small"
        :variant="isCurrent(f) ? 'flat' : 'tonal'"
        @click="use(f)"
      >
        {{ spotTitle(f) }}
      </v-chip>
    </div>

    <!-- only once the building and floor are filled in correctly -->
    <v-btn
      v-if="currentFloor !== null && spot.locationId !== null"
      :color="currentFavourite ? 'amber-darken-2' : undefined"
      :disabled="disabled"
      :loading="isSaving"
      :prepend-icon="currentFavourite ? 'mdi-star' : 'mdi-star-outline'"
      size="small"
      variant="text"
      @click="currentFavourite ? removeCurrent() : (isNaming = true)"
    >
      {{ currentFavourite ? 'Favourited' : 'Favourite this place' }}
    </v-btn>

    <!-- an optional name for the place, e.g. Home -->
    <v-dialog v-model="isNaming" max-width="400">
      <v-card rounded="lg">
        <v-card-title>Favourite this place</v-card-title>

        <v-card-text>
          <p class="text-body-2 text-medium-emphasis mb-4">{{ currentDescription }}</p>

          <v-text-field
            v-model="label"
            autofocus
            :counter="MAX_LABEL_LENGTH"
            density="comfortable"
            label="Name (optional)"
            :maxlength="MAX_LABEL_LENGTH"
            placeholder="e.g. Home, Lab"
            variant="outlined"
            @keydown.enter="add"
          />
        </v-card-text>

        <v-card-actions>
          <v-spacer />
          <v-btn :disabled="isSaving" variant="text" @click="isNaming = false">Cancel</v-btn>

          <v-btn
            color="primary"
            :loading="isSaving"
            prepend-icon="mdi-star"
            variant="flat"
            @click="add"
          >Favourite</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script lang="ts" setup>
  import type { Location } from '@/api/supplier'
  import type { BuildingSpotInput } from '@/components/BuildingSpotFields.vue'
  import { computed, onMounted, ref } from 'vue'
  import { type Favourite, MAX_LABEL_LENGTH } from '@/api/favourite'
  import { useAlertStore } from '@/stores/alerts'
  import { useFavouriteStore } from '@/stores/favourites'
  import { apiErrorMessage } from '@/util/order'
  import { floorInput, formatSpot, parseFloor } from '@/util/supplier'

  const props = defineProps<{
    locations: Location[]
    disabled?: boolean
  }>()

  const spot = defineModel<BuildingSpotInput>({ required: true })

  const favouriteStore = useFavouriteStore()
  const alertStore = useAlertStore()

  const isSaving = ref(false)
  const isNaming = ref(false)
  const label = ref('')

  const currentFloor = computed(() => parseFloor(spot.value.floor))
  const currentFavourite = computed(() => spot.value.locationId === null || currentFloor.value === null
    ? null
    : favouriteStore.spotFavourite(spot.value.locationId, currentFloor.value, spot.value.room))

  function buildingName (locationId: number, fallback?: string | null) {
    return fallback ?? props.locations.find(l => l.id === locationId)?.name ?? 'Unknown building'
  }

  // "Home: Central Library · Level 5 · #05-12", or just the place without a name
  function spotTitle (f: Favourite) {
    const place = formatSpot(buildingName(f.targetId, f.location?.name), f.floor, f.room)
    return f.label ? `${f.label}: ${place}` : place
  }

  const currentDescription = computed(() => spot.value.locationId === null || currentFloor.value === null
    ? ''
    : formatSpot(buildingName(spot.value.locationId), currentFloor.value, spot.value.room))

  function isCurrent (f: Favourite) {
    return currentFavourite.value?.id === f.id
  }

  // fills in the building, floor and room
  function use (f: Favourite) {
    spot.value = { locationId: f.targetId, floor: floorInput(f.floor), room: f.room ?? '' }
  }

  async function add () {
    if (spot.value.locationId === null || currentFloor.value === null || isSaving.value) {
      return
    }
    isSaving.value = true
    try {
      await favouriteStore.add({
        kind: 'LOCATION',
        targetId: spot.value.locationId,
        floor: currentFloor.value,
        room: spot.value.room.trim() || null,
        label: label.value.trim() || null,
      })
      isNaming.value = false
      label.value = ''
    } catch (error) {
      console.error('Error adding favourite', error)
      alertStore.error(apiErrorMessage(error, 'Could not add this place to your favourites'))
    } finally {
      isSaving.value = false
    }
  }

  async function removeCurrent () {
    if (!currentFavourite.value || isSaving.value) {
      return
    }
    isSaving.value = true
    try {
      await favouriteStore.remove(currentFavourite.value.id)
    } catch (error) {
      console.error('Error removing favourite', error)
      alertStore.error(apiErrorMessage(error, 'Could not remove this favourite'))
    } finally {
      isSaving.value = false
    }
  }

  onMounted(() => void favouriteStore.ensureLoaded())
</script>
