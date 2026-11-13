<!-- Admin dialog to create a supplier, or edit one when `supplier` is given -->
<template>
  <v-dialog v-model="isOpen" max-width="640" persistent scrollable>
    <v-card rounded="lg">
      <v-card-title class="pt-5 px-6">{{ isEdit ? 'Edit supplier' : 'Add supplier' }}</v-card-title>

      <v-card-text class="px-6">
        <v-form ref="formRef" :disabled="isSaving" @submit.prevent="save">
          <!-- Name -->
          <v-text-field
            v-model="form.name"
            class="mb-2"
            counter="100"
            density="comfortable"
            :error-messages="serverErrors.name"
            label="Name *"
            :rules="[required('Name'), maxLength(100)]"
            variant="outlined"
          />

          <!-- Types -->
          <v-select
            v-model="form.type"
            chips
            class="mb-2"
            closable-chips
            density="comfortable"
            :error-messages="serverErrors.type"
            :items="typeOptions"
            label="Type *"
            multiple
            :rules="[(v: string[]) => v.length > 0 || 'Choose at least one type']"
            variant="outlined"
          />

          <!-- Building and floor -->
          <v-row dense>
            <v-col cols="12" sm="8">
              <v-autocomplete
                v-model="form.locationId"
                density="comfortable"
                :error-messages="serverErrors.locationId"
                item-title="name"
                item-value="id"
                :items="locations"
                label="Building *"
                :loading="isLoadingLocations"
                :rules="[(v: number | null) => v !== null || 'Building is required']"
                variant="outlined"
              />
            </v-col>

            <v-col cols="12" sm="4">
              <v-text-field
                v-model="form.floor"
                density="comfortable"
                :error-messages="serverErrors.floor"
                label="Floor"
                :rules="[wholeNumber]"
                type="number"
                variant="outlined"
              />
            </v-col>
          </v-row>

          <!-- Opening hours, both or neither -->
          <v-row dense>
            <v-col cols="6">
              <v-text-field
                ref="opensAtRef"
                v-model="form.opensAt"
                density="comfortable"
                :error-messages="serverErrors.opensAt"
                label="Opens at"
                :rules="[hoursPaired]"
                type="time"
                variant="outlined"
              />
            </v-col>

            <v-col cols="6">
              <v-text-field
                ref="closesAtRef"
                v-model="form.closesAt"
                density="comfortable"
                :error-messages="serverErrors.closesAt"
                hint="Earlier than opening time means open past midnight"
                label="Closes at"
                :rules="[hoursPaired]"
                type="time"
                variant="outlined"
              />
            </v-col>
          </v-row>

          <!-- Image URL -->
          <v-text-field
            v-model="form.imageUrl"
            class="mb-2"
            density="comfortable"
            :error-messages="serverErrors.imageUrl"
            label="Image URL"
            placeholder="https://..."
            :rules="[validUrl]"
            variant="outlined"
          />

          <!-- Description -->
          <v-textarea
            v-model="form.description"
            auto-grow
            counter="500"
            density="comfortable"
            :error-messages="serverErrors.description"
            label="Description"
            rows="2"
            :rules="[maxLength(500)]"
            variant="outlined"
          />
        </v-form>
      </v-card-text>

      <v-card-actions class="px-6 pb-4">
        <v-spacer />
        <v-btn :disabled="isSaving" variant="text" @click="isOpen = false">Cancel</v-btn>

        <v-btn color="primary" :loading="isSaving" variant="flat" @click="save">
          {{ isEdit ? 'Save changes' : 'Add supplier' }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script lang="ts" setup>
  import type { VForm } from 'vuetify/components'
  import axios from 'axios'
  import { computed, ref, watch } from 'vue'
  import {
    createSupplier,
    listLocations,
    type Location,
    type Supplier,
    SUPPLIER_TYPES,
    type SupplierInput,
    type SupplierType,
    updateSupplier,
  } from '@/api/supplier'
  import { useAlertStore } from '@/stores/alerts'
  import { supplierTypeInfo, toHourMinute } from '@/util/supplier'

  const props = defineProps<{ supplier?: Supplier | null }>()
  const emit = defineEmits<{ saved: [supplier: Supplier] }>()
  const isOpen = defineModel<boolean>({ required: true })

  const alertStore = useAlertStore()

  const isEdit = computed(() => Boolean(props.supplier))
  const typeOptions = SUPPLIER_TYPES.map(type => ({ title: supplierTypeInfo[type].label, value: type }))

  interface FormState {
    name: string
    type: SupplierType[]
    locationId: number | null
    // text inputs, converted when saving
    floor: string
    imageUrl: string
    description: string
    opensAt: string
    closesAt: string
  }

  const formRef = ref<VForm | null>(null)
  const opensAtRef = ref<{ validate: () => Promise<string[]> } | null>(null)
  const closesAtRef = ref<{ validate: () => Promise<string[]> } | null>(null)
  const form = ref<FormState>(emptyForm())
  const serverErrors = ref<Record<string, string[]>>({})
  const isSaving = ref(false)

  const locations = ref<Location[]>([])
  const isLoadingLocations = ref(false)

  function emptyForm (): FormState {
    return { name: '', type: [], locationId: null, floor: '', imageUrl: '', description: '', opensAt: '', closesAt: '' }
  }

  function formFromSupplier (supplier: Supplier): FormState {
    return {
      name: supplier.name,
      type: [...supplier.type],
      locationId: supplier.locationId,
      floor: supplier.floor === null ? '' : String(supplier.floor),
      imageUrl: supplier.imageUrl ?? '',
      description: supplier.description ?? '',
      opensAt: toHourMinute(supplier.opensAt) ?? '',
      closesAt: toHourMinute(supplier.closesAt) ?? '',
    }
  }

  // validation rules, the backend checks these again
  const required = (label: string) => (v: string) => v.trim().length > 0 || `${label} is required`
  const maxLength = (max: number) => (v: string) => v.length <= max || `At most ${max} characters`
  const wholeNumber = (v: string) => v === '' || Number.isInteger(Number(v)) || 'Must be a whole number'
  const hoursPaired = () => (form.value.opensAt === '') === (form.value.closesAt === '') || 'Set both opening and closing times, or neither'
  function validUrl (v: string) {
    if (v.trim() === '') {
      return true
    }
    try {
      return ['http:', 'https:'].includes(new URL(v.trim()).protocol) || 'Must be an http(s) URL'
    } catch {
      return 'Must be a valid URL'
    }
  }

  function toInput (state: FormState): SupplierInput {
    return {
      name: state.name.trim(),
      type: state.type,
      locationId: state.locationId!,
      floor: state.floor === '' ? null : Number(state.floor),
      imageUrl: state.imageUrl.trim() || null,
      description: state.description.trim() || null,
      opensAt: state.opensAt || null,
      closesAt: state.closesAt || null,
    }
  }

  // only the fields that differ from the stored supplier
  function changedFields (input: SupplierInput, original: SupplierInput): Partial<SupplierInput> {
    const patch: Record<string, unknown> = {}
    for (const key of Object.keys(input) as (keyof SupplierInput)[]) {
      if (JSON.stringify(input[key]) !== JSON.stringify(original[key])) {
        patch[key] = input[key]
      }
    }
    return patch as Partial<SupplierInput>
  }

  async function loadLocations () {
    isLoadingLocations.value = true
    try {
      locations.value = await listLocations()
    } catch (error) {
      console.error('Error loading locations', error)
      alertStore.error('Could not load buildings')
    } finally {
      isLoadingLocations.value = false
    }
  }

  async function save () {
    serverErrors.value = {}
    const result = await formRef.value?.validate()
    if (!result?.valid || isSaving.value) {
      return
    }

    const input = toInput(form.value)
    isSaving.value = true
    try {
      let saved: Supplier
      if (props.supplier) {
        const patch = changedFields(input, toInput(formFromSupplier(props.supplier)))
        if (Object.keys(patch).length === 0) {
          isOpen.value = false
          return
        }
        saved = await updateSupplier(props.supplier.id, patch)
        alertStore.success(`Saved ${saved.name}`)
      } else {
        saved = await createSupplier(input)
        alertStore.success(`Added ${saved.name}`)
      }
      emit('saved', saved)
      isOpen.value = false
    } catch (error) {
      // field errors from the backend are shown next to their inputs
      const data = axios.isAxiosError(error) ? error.response?.data : undefined
      if (data?.fields && Object.keys(data.fields).length > 0) {
        serverErrors.value = data.fields
      } else {
        console.error('Error saving supplier', error)
        alertStore.error(data?.errors?.[0] ?? data?.error ?? 'Could not save supplier')
      }
    } finally {
      isSaving.value = false
    }
  }

  // reset the form each time the dialog opens
  watch(isOpen, open => {
    if (!open) {
      return
    }
    form.value = props.supplier ? formFromSupplier(props.supplier) : emptyForm()
    serverErrors.value = {}
    formRef.value?.resetValidation()
    // reload in case buildings were added or deleted since last time
    loadLocations()
  }, { immediate: true })

  // re-check the paired hours rule on both time fields when either changes
  watch(() => [form.value.opensAt, form.value.closesAt], () => {
    opensAtRef.value?.validate()
    closesAtRef.value?.validate()
  })
</script>
