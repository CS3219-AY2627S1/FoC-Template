<template>
  <v-container class="py-6" max-width="800">
    <!-- Back button to the supplier list -->
    <v-btn
      class="mb-4"
      prepend-icon="mdi-arrow-left"
      :to="{ name: 'suppliers' }"
      variant="text"
    >
      All suppliers
    </v-btn>

    <!-- Show placeholder outline while the supplier is loading -->
    <v-skeleton-loader v-if="isLoading" type="image, heading, list-item-three-line" />

    <!-- Show not found state if the supplier doesn't exist or has been deleted -->
    <v-empty-state
      v-else-if="!supplier"
      icon="mdi-store-remove-outline"
      text="It may have been removed."
      title="Supplier not found"
    />

    <!-- Supplier details card with image, name, type, open status, location, hours and description -->
    <v-card v-else rounded="lg">
      <supplier-image :height="260" :supplier="supplier" />

      <!-- Supplier name, a star to save it, and edit and delete buttons for admins -->
      <v-card-item>
        <v-card-title class="text-h5 text-wrap">{{ supplier.name }}</v-card-title>

        <template #append>
          <supplier-star-button :supplier-id="supplier.id" />

          <template v-if="auth.isAdmin">
            <v-btn
              aria-label="Edit supplier"
              icon="mdi-pencil"
              variant="text"
              @click="isEditOpen = true"
            />

            <v-btn
              aria-label="Delete supplier"
              color="error"
              icon="mdi-delete-outline"
              variant="text"
              @click="isDeleteOpen = true"
            />
          </template>
        </template>
      </v-card-item>

      <v-card-text>
        <!-- Type chips and open status -->
        <div class="d-flex flex-wrap ga-1 mb-4">
          <v-chip
            v-for="type in supplier.type"
            :key="type"
            :color="supplierTypeInfo[type].color"
            label
            :prepend-icon="supplierTypeInfo[type].icon"
            size="small"
          >
            {{ supplierTypeInfo[type].label }}
          </v-chip>

          <v-chip :color="openStatus(supplier).color" label size="small" variant="tonal">
            {{ openStatus(supplier).label }}
          </v-chip>
        </div>

        <!-- Location, opening hours and description (only shown if the supplier has one) -->
        <v-list class="pa-0" density="compact">
          <v-list-item prepend-icon="mdi-map-marker-outline" :subtitle="formatLocation(supplier, locations)" title="Location" />
          <v-list-item prepend-icon="mdi-clock-outline" :subtitle="formatHours(supplier)" title="Opening hours" />

          <v-list-item
            v-if="supplier.description"
            prepend-icon="mdi-information-outline"
            title="Description"
          >
            <v-list-item-subtitle class="text-wrap">{{ supplier.description }}</v-list-item-subtitle>
          </v-list-item>
        </v-list>
      </v-card-text>
    </v-card>

    <!-- Admin: edit supplier dialog -->
    <supplier-form-dialog
      v-if="auth.isAdmin && supplier"
      v-model="isEditOpen"
      :supplier="supplier"
      @saved="saved => supplier = saved"
    />

    <!-- Admin: confirm before deleting -->
    <v-dialog v-model="isDeleteOpen" max-width="440" :persistent="isDeleting">
      <v-card rounded="lg">
        <v-card-title class="pt-5 px-6">Delete supplier?</v-card-title>

        <v-card-text class="px-6">
          {{ supplier?.name }} will be removed from the supplier list. Its record is kept for history, and its name can't be reused.
        </v-card-text>

        <v-card-actions class="px-6 pb-4">
          <v-spacer />
          <v-btn :disabled="isDeleting" variant="text" @click="isDeleteOpen = false">Cancel</v-btn>
          <v-btn color="error" :loading="isDeleting" variant="flat" @click="confirmDelete">Delete</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<script lang="ts" setup>
  import axios from 'axios'
  import { ref, watch } from 'vue'
  import { useRoute, useRouter } from 'vue-router'
  import { deleteSupplier, getSupplier, listLocations, type Location, type Supplier } from '@/api/supplier'
  import SupplierFormDialog from '@/components/SupplierFormDialog.vue'
  import SupplierImage from '@/components/SupplierImage.vue'
  import SupplierStarButton from '@/components/SupplierStarButton.vue'
  import { useAlertStore } from '@/stores/alerts'
  import { useAuthStore } from '@/stores/auth'
  import { formatHours, formatLocation, openStatus, supplierTypeInfo } from '@/util/supplier'

  const route = useRoute()
  const router = useRouter()
  const alertStore = useAlertStore()
  const auth = useAuthStore()

  const supplier = ref<Supplier | null>(null)
  const locations = ref<Location[]>([])
  const isLoading = ref(true)

  const isEditOpen = ref(false)
  const isDeleteOpen = ref(false)
  const isDeleting = ref(false)

  async function confirmDelete () {
    if (!supplier.value) {
      return
    }
    isDeleting.value = true
    try {
      await deleteSupplier(supplier.value.id)
      alertStore.success(`Deleted ${supplier.value.name}`)
      isDeleteOpen.value = false
      router.push({ name: 'suppliers' })
    } catch (error) {
      console.error('Error deleting supplier', error)
      const data = axios.isAxiosError(error) ? error.response?.data : undefined
      alertStore.error(data?.error ?? 'Could not delete supplier')
    } finally {
      isDeleting.value = false
    }
  }

  async function loadSupplier (id: string) {
    isLoading.value = true
    supplier.value = null
    try {
      supplier.value = await getSupplier(id)
    } catch (error) {
      // 400 (bad id) and 404 show the not found state
      const status = axios.isAxiosError(error) ? error.response?.status : undefined
      if (status !== 400 && status !== 404) {
        console.error('Error loading supplier', error)
        alertStore.error('Could not load supplier')
      }
    } finally {
      isLoading.value = false
    }
  }

  // suppliers only store locationId, the building name comes from this list
  async function loadLocations () {
    try {
      locations.value = await listLocations()
    } catch (error) {
      console.error('Error loading locations', error)
    }
  }

  watch(() => route.params.id as string, loadSupplier, { immediate: true })
  loadLocations()
</script>
