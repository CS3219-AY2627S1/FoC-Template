<!-- Admin dialog to add and delete locations (buildings) -->
<template>
  <v-dialog v-model="isOpen" max-width="520" scrollable>
    <v-card rounded="lg">
      <v-card-title class="pt-5 px-6">Manage buildings</v-card-title>

      <v-card-text class="px-6">
        <!-- Add a building -->
        <v-form ref="formRef" class="d-flex ga-2 align-start mb-4" @submit.prevent="add">
          <v-text-field
            v-model="newName"
            counter="100"
            density="comfortable"
            :disabled="isAdding"
            :error-messages="addError"
            label="New building name"
            :rules="[(v: string) => v.trim().length > 0 || 'Name is required', (v: string) => v.length <= 100 || 'At most 100 characters']"
            validate-on="submit"
            variant="outlined"
          />

          <v-btn
            class="mt-2"
            color="primary"
            :loading="isAdding"
            type="submit"
            variant="flat"
          >
            Add
          </v-btn>
        </v-form>

        <v-progress-linear v-if="isLoading" class="mb-2" color="primary" indeterminate />

        <!-- Existing buildings, each with delete (asks to confirm first) -->
        <v-list class="pa-0" density="compact">
          <v-list-item
            v-for="location in locations"
            :key="location.id"
            :title="location.name"
          >
            <template #append>
              <template v-if="pendingDeleteId === location.id">
                <v-btn
                  :disabled="isDeleting"
                  size="small"
                  variant="text"
                  @click="pendingDeleteId = null"
                >
                  Cancel
                </v-btn>

                <v-btn
                  color="error"
                  :loading="isDeleting"
                  size="small"
                  variant="flat"
                  @click="remove(location)"
                >
                  Delete
                </v-btn>
              </template>

              <v-btn
                v-else
                :aria-label="`Delete ${location.name}`"
                color="error"
                icon="mdi-delete-outline"
                size="small"
                variant="text"
                @click="pendingDeleteId = location.id"
              />
            </template>
          </v-list-item>
        </v-list>

        <p v-if="!isLoading && locations.length === 0" class="text-body-2 text-medium-emphasis">
          No buildings yet.
        </p>

        <p class="text-caption text-medium-emphasis mt-3">
          A building can only be deleted when no supplier uses it.
        </p>
      </v-card-text>

      <v-card-actions class="px-6 pb-4">
        <v-spacer />
        <v-btn variant="text" @click="isOpen = false">Done</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script lang="ts" setup>
  import type { VForm } from 'vuetify/components'
  import axios from 'axios'
  import { ref, watch } from 'vue'
  import { createLocation, deleteLocation, listLocations, type Location } from '@/api/supplier'
  import { useAlertStore } from '@/stores/alerts'

  // tells the page to reload its own list of locations
  const emit = defineEmits<{ changed: [] }>()
  const isOpen = defineModel<boolean>({ required: true })

  const alertStore = useAlertStore()

  const formRef = ref<VForm | null>(null)
  const locations = ref<Location[]>([])
  const isLoading = ref(false)

  const newName = ref('')
  const addError = ref<string[]>([])
  const isAdding = ref(false)

  const pendingDeleteId = ref<number | null>(null)
  const isDeleting = ref(false)

  async function loadLocations () {
    isLoading.value = true
    try {
      locations.value = await listLocations()
    } catch (error) {
      console.error('Error loading locations', error)
      alertStore.error('Could not load buildings')
    } finally {
      isLoading.value = false
    }
  }

  async function add () {
    addError.value = []
    const result = await formRef.value?.validate()
    if (!result?.valid || isAdding.value) {
      return
    }

    isAdding.value = true
    try {
      const created = await createLocation(newName.value.trim())
      alertStore.success(`Added ${created.name}`)
      newName.value = ''
      formRef.value?.resetValidation()
      await loadLocations()
      emit('changed')
    } catch (error) {
      // e.g. 409 when the name already exists
      const data = axios.isAxiosError(error) ? error.response?.data : undefined
      const status = axios.isAxiosError(error) ? error.response?.status : undefined
      if (data?.fields?.name) {
        addError.value = data.fields.name
      } else if (status === 409) {
        // names are unique, including buildings that were deleted
        addError.value = ['A building with this name already exists (it may have been deleted)']
      } else {
        console.error('Error adding building', error)
        alertStore.error(data?.error ?? 'Could not add building')
      }
    } finally {
      isAdding.value = false
    }
  }

  async function remove (location: Location) {
    isDeleting.value = true
    try {
      await deleteLocation(location.id)
      alertStore.success(`Deleted ${location.name}`)
      pendingDeleteId.value = null
      await loadLocations()
      emit('changed')
    } catch (error) {
      // e.g. 409 when suppliers still use the building
      const data = axios.isAxiosError(error) ? error.response?.data : undefined
      console.error('Error deleting building', error)
      alertStore.error(data?.error ?? 'Could not delete building')
    } finally {
      isDeleting.value = false
    }
  }

  // refresh the list and clear the form each time the dialog opens
  watch(isOpen, open => {
    if (!open) {
      return
    }
    newName.value = ''
    addError.value = []
    pendingDeleteId.value = null
    loadLocations()
  }, { immediate: true })
</script>
