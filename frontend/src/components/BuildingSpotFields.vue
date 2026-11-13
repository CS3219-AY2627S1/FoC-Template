<!-- A spot in a building for an errand's pickup or dropoff: the building, a required floor and an optional room -->
<template>
  <div>
    <v-autocomplete
      v-model="spot.locationId"
      class="mb-2"
      density="comfortable"
      :error-messages="errors.locationId"
      item-title="name"
      item-value="id"
      :items="locations"
      :label="`${label} *`"
      :prepend-inner-icon="icon"
      :rules="[(v: number | null) => v !== null || 'Choose a building']"
      variant="outlined"
    />

    <v-row dense>
      <v-col cols="12" sm="4">
        <v-text-field
          v-model="spot.floor"
          density="comfortable"
          :error-messages="errors.floor"
          hint="e.g. 3, B1 for basement, G for ground (level 1)"
          label="Floor *"
          :rules="[floorRule]"
          variant="outlined"
        />
      </v-col>

      <v-col cols="12" sm="8">
        <v-text-field
          v-model="spot.room"
          counter="50"
          density="comfortable"
          :error-messages="errors.room"
          label="Room / unit"
          placeholder="e.g. #01-23"
          :rules="[maxLength(50)]"
          variant="outlined"
        />
      </v-col>
    </v-row>
  </div>
</template>

<script lang="ts" setup>
  import type { Location } from '@/api/supplier'
  import { HIGHEST_FLOOR, LOWEST_FLOOR, parseFloor } from '@/util/supplier'

  // text inputs, converted when submitting
  export interface BuildingSpotInput {
    locationId: number | null
    // as typed, e.g. "3" or "B1"; see parseFloor
    floor: string
    room: string
  }

  withDefaults(defineProps<{
    label: string
    icon: string
    locations: Location[]
    // field errors from the order service, e.g. { floor: ['Floor is required'] }
    errors?: Partial<Record<keyof BuildingSpotInput, string[]>>
  }>(), { errors: () => ({}) })

  const spot = defineModel<BuildingSpotInput>({ required: true })

  // the same limits the order service enforces; ground floor is 1
  function floorRule (v: string) {
    if (v.trim() === '') {
      return 'Floor is required'
    }
    return parseFloor(v) !== null || `Enter a floor from B${-LOWEST_FLOOR} to ${HIGHEST_FLOOR}, e.g. 3 or B1 (ground floor is 1)`
  }
  const maxLength = (max: number) => (v: string) => v.length <= max || `At most ${max} characters`
</script>
