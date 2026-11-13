<!-- The signed-in user's favourites: places (e.g. Home) and suppliers, to favourite, rename or remove -->
<template>
  <v-container class="py-6" max-width="900">
    <h1 class="text-h5 font-weight-bold mb-1">Favourites</h1>

    <p class="text-body-2 text-medium-emphasis mb-4">
      Favourite a place such as your room on campus, or star a supplier, to pick it in one tap when requesting an errand. Places removed from CampusGo disappear from here too. Up to {{ MAX_FAVOURITES }} favourites.
    </p>

    <v-skeleton-loader v-if="isLoading" type="list-item-avatar-two-line@4" />

    <v-alert
      v-else-if="favouriteStore.loadFailed && favouriteStore.favourites.length === 0"
      text="Could not load your favourites. Try again in a moment."
      type="warning"
      variant="tonal"
    />

    <!-- Places and Suppliers always show, each with its own way to favourite more -->
    <template v-else>
      <template v-for="group in groups" :key="group.kind">
        <div class="d-flex flex-wrap align-center justify-space-between ga-2 mb-2">
          <div class="text-subtitle-2">{{ group.title }}</div>

          <v-btn
            v-if="group.kind === 'LOCATION'"
            color="primary"
            :disabled="isFull"
            :min-width="ACTION_MIN_WIDTH"
            prepend-icon="mdi-map-marker-plus-outline"
            size="small"
            variant="tonal"
            @click="openAdd"
          >
            Favourite a place
          </v-btn>

          <v-btn
            v-else
            color="primary"
            :disabled="isFull"
            :min-width="ACTION_MIN_WIDTH"
            prepend-icon="mdi-store-plus-outline"
            size="small"
            variant="tonal"
            @click="openAddSupplier"
          >
            Favourite a supplier
          </v-btn>
        </div>

        <p v-if="group.items.length === 0" class="text-body-2 text-medium-emphasis mb-6">
          {{ group.emptyText }}
        </p>

        <v-card v-else class="mb-6" rounded="lg" variant="outlined">
          <v-list lines="two">
            <template v-for="(f, i) in group.items" :key="f.id">
              <v-divider v-if="i > 0" />

              <v-list-item :to="f.kind === 'SUPPLIER' && f.supplier ? { name: 'supplier', params: { id: f.targetId } } : undefined">
                <template #prepend>
                  <v-avatar color="amber-lighten-4">
                    <v-icon color="amber-darken-3">{{ f.kind === 'SUPPLIER' ? 'mdi-store-outline' : 'mdi-map-marker-outline' }}</v-icon>
                  </v-avatar>
                </template>

                <v-list-item-title>{{ title(f) }}</v-list-item-title>
                <v-list-item-subtitle>{{ subtitle(f) }}</v-list-item-subtitle>

                <template #append>
                  <v-btn
                    aria-label="Rename"
                    icon="mdi-pencil-outline"
                    size="small"
                    variant="text"
                    @click.prevent.stop="startRename(f)"
                  />

                  <v-btn
                    aria-label="Remove from favourites"
                    color="error"
                    icon="mdi-star-off-outline"
                    :loading="removingId === f.id"
                    size="small"
                    variant="text"
                    @click.prevent.stop="remove(f)"
                  />
                </template>
              </v-list-item>
            </template>
          </v-list>
        </v-card>
      </template>
    </template>

    <!-- Favourite a place: a name, and a building with floor and optional room -->
    <v-dialog max-width="520" :model-value="isAdding" @update:model-value="value => { if (!value && !isSaving) isAdding = false }">
      <v-card rounded="lg">
        <v-card-title>Favourite a place</v-card-title>

        <v-card-text>
          <v-form ref="addFormRef" :disabled="isSaving" @submit.prevent="add">
            <v-text-field
              v-model="newPlace.label"
              class="mb-2"
              :counter="MAX_LABEL_LENGTH"
              density="comfortable"
              label="Name"
              :maxlength="MAX_LABEL_LENGTH"
              placeholder="e.g. Home, Lab"
              prepend-inner-icon="mdi-tag-outline"
              variant="outlined"
            />

            <building-spot-fields
              v-model="newPlace.spot"
              icon="mdi-office-building-marker-outline"
              label="Building"
              :locations="locations"
            />
          </v-form>
        </v-card-text>

        <v-card-actions>
          <v-spacer />
          <v-btn :disabled="isSaving" variant="text" @click="isAdding = false">Cancel</v-btn>

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

    <!-- Favourite a supplier: search by name, then pick one -->
    <v-dialog max-width="520" :model-value="isAddingSupplier" @update:model-value="value => { if (!value && !isSaving) isAddingSupplier = false }">
      <v-card rounded="lg">
        <v-card-title>Favourite a supplier</v-card-title>

        <v-card-text>
          <v-autocomplete
            v-model="chosenSupplierId"
            v-model:search="supplierSearch"
            autofocus
            density="comfortable"
            item-title="name"
            item-value="id"
            :items="supplierOptions"
            label="Supplier"
            :loading="isSearchingSuppliers"
            no-filter
            prepend-inner-icon="mdi-store-search-outline"
            variant="outlined"
          >
            <template #item="{ props: itemProps, item }">
              <v-list-item
                v-bind="itemProps"
                :subtitle="favouriteStore.supplierFavourite(item.id) ? 'Already a favourite' : formatLocation(item, locations)"
              />
            </template>

            <template #no-data>
              <v-list-item :title="supplierSearch ? 'No suppliers match your search' : 'Type to search suppliers'" />
            </template>
          </v-autocomplete>
        </v-card-text>

        <v-card-actions>
          <v-spacer />
          <v-btn :disabled="isSaving" variant="text" @click="isAddingSupplier = false">Cancel</v-btn>

          <v-btn
            color="primary"
            :disabled="chosenSupplierId === null"
            :loading="isSaving"
            prepend-icon="mdi-star"
            variant="flat"
            @click="addSupplier"
          >
            Favourite
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Rename a favourite -->
    <v-dialog max-width="400" :model-value="renaming !== null" @update:model-value="value => { if (!value && !isRenaming) renaming = null }">
      <v-card v-if="renaming" rounded="lg">
        <v-card-title>Rename favourite</v-card-title>

        <v-card-text>
          <p class="text-body-2 text-medium-emphasis mb-4">{{ place(renaming) }}</p>

          <v-text-field
            v-model="newLabel"
            autofocus
            clearable
            :counter="MAX_LABEL_LENGTH"
            density="comfortable"
            hint="Leave blank to show the place's own name"
            label="Name"
            :maxlength="MAX_LABEL_LENGTH"
            persistent-hint
            variant="outlined"
            @keydown.enter="saveRename"
          />
        </v-card-text>

        <v-card-actions>
          <v-spacer />
          <v-btn :disabled="isRenaming" variant="text" @click="renaming = null">Cancel</v-btn>
          <v-btn color="primary" :loading="isRenaming" variant="flat" @click="saveRename">Save</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<script lang="ts" setup>
  import type { VForm } from 'vuetify/components'
  import { computed, onMounted, ref, watch } from 'vue'
  import { type Favourite, MAX_FAVOURITES, MAX_LABEL_LENGTH } from '@/api/favourite'
  import { listLocations, listSuppliers, type Location, type Supplier } from '@/api/supplier'
  import BuildingSpotFields, { type BuildingSpotInput } from '@/components/BuildingSpotFields.vue'
  import { useAlertStore } from '@/stores/alerts'
  import { useFavouriteStore } from '@/stores/favourites'
  import { apiErrorMessage } from '@/util/order'
  import { formatFloor, formatLocation, formatSpot, parseFloor } from '@/util/supplier'

  const favouriteStore = useFavouriteStore()
  const alertStore = useAlertStore()

  const isLoading = ref(true)
  // building names, for the building pickers and a favourite supplier's building
  const locations = ref<Location[]>([])

  const groups = computed(() => [
    {
      kind: 'LOCATION',
      title: 'Places',
      items: favouriteStore.spots,
      emptyText: 'Favourite a place such as Home, with its building, floor and room, to fill it in with one tap.',
    },
    {
      kind: 'SUPPLIER',
      title: 'Suppliers',
      items: favouriteStore.suppliers,
      emptyText: 'Favourite a supplier you order from often, or tap the star on any supplier, to pick it in one tap.',
    },
  ])

  const isFull = computed(() => favouriteStore.favourites.length >= MAX_FAVOURITES)
  // both section buttons share one width so they line up; fits "Favourite a supplier" with its icon
  const ACTION_MIN_WIDTH = 176

  // favouriting a supplier: searched by name as you type, like the errand form
  const SEARCH_DEBOUNCE_MS = 300
  const isAddingSupplier = ref(false)
  const chosenSupplierId = ref<number | null>(null)
  const supplierSearch = ref('')
  const supplierOptions = ref<Supplier[]>([])
  const isSearchingSuppliers = ref(false)

  // ignore search results superseded by newer typing
  let latestSearch = 0
  async function searchSuppliers (name: string) {
    const search = ++latestSearch
    isSearchingSuppliers.value = true
    try {
      const page = await listSuppliers({ name, sortBy: 'name', sortOrder: 'asc', page: 1 })
      if (search !== latestSearch) {
        return
      }
      // keep the chosen supplier in the list so its name still shows
      const chosen = supplierOptions.value.find(s => s.id === chosenSupplierId.value)
      supplierOptions.value = chosen && !page.data.some(s => s.id === chosen.id) ? [chosen, ...page.data] : page.data
    } catch (error) {
      console.error('Error searching suppliers', error)
    } finally {
      if (search === latestSearch) {
        isSearchingSuppliers.value = false
      }
    }
  }

  let searchTimer: ReturnType<typeof setTimeout> | undefined
  watch(supplierSearch, value => {
    // the box shows the chosen supplier's name after picking; no need to search for it
    const chosen = supplierOptions.value.find(s => s.id === chosenSupplierId.value)
    if (!isAddingSupplier.value || (chosen && value === chosen.name)) {
      return
    }
    clearTimeout(searchTimer)
    searchTimer = setTimeout(() => searchSuppliers(value ?? ''), SEARCH_DEBOUNCE_MS)
  })

  function openAddSupplier () {
    chosenSupplierId.value = null
    supplierSearch.value = ''
    isAddingSupplier.value = true
    void searchSuppliers('')
  }

  async function addSupplier () {
    const supplier = supplierOptions.value.find(s => s.id === chosenSupplierId.value)
    if (!supplier || isSaving.value) {
      return
    }
    isSaving.value = true
    try {
      await favouriteStore.add({ kind: 'SUPPLIER', targetId: supplier.id })
      alertStore.success(`${supplier.name} is now a favourite`)
      isAddingSupplier.value = false
    } catch (error) {
      console.error('Error adding favourite', error)
      alertStore.error(apiErrorMessage(error, 'Could not favourite this supplier'))
    } finally {
      isSaving.value = false
    }
  }

  function buildingName (locationId: number) {
    return locations.value.find(l => l.id === locationId)?.name ?? 'Unknown building'
  }

  // the place itself, e.g. "Cafe A" or "Com 3 · B1 · Room 1"
  function place (f: Favourite) {
    if (f.kind === 'SUPPLIER') {
      return f.supplier?.name ?? 'Supplier details unavailable right now'
    }
    return formatSpot(f.location?.name ?? 'Building details unavailable right now', f.floor, f.room)
  }

  function title (f: Favourite) {
    return f.label ?? place(f)
  }

  function subtitle (f: Favourite) {
    if (f.label) {
      return place(f)
    }
    if (f.kind === 'SUPPLIER' && f.supplier) {
      const s = f.supplier
      return s.floor === null ? buildingName(s.locationId) : `${buildingName(s.locationId)} · ${formatFloor(s.floor)}`
    }
    return 'Favourite place'
  }

  // adding a place
  const addFormRef = ref<VForm | null>(null)
  const isAdding = ref(false)
  const isSaving = ref(false)
  const newPlace = ref<{ label: string, spot: BuildingSpotInput }>({ label: '', spot: { locationId: null, floor: '', room: '' } })

  function openAdd () {
    newPlace.value = { label: '', spot: { locationId: null, floor: '', room: '' } }
    isAdding.value = true
  }

  async function add () {
    const result = await addFormRef.value?.validate()
    const { spot, label } = newPlace.value
    const floor = parseFloor(spot.floor)
    if (!result?.valid || spot.locationId === null || floor === null || isSaving.value) {
      return
    }
    isSaving.value = true
    try {
      await favouriteStore.add({
        kind: 'LOCATION',
        targetId: spot.locationId,
        floor,
        room: spot.room.trim() || null,
        label: label.trim() || null,
      })
      alertStore.success(`${label.trim() || 'Place'} is now a favourite`)
      isAdding.value = false
    } catch (error) {
      console.error('Error adding favourite', error)
      alertStore.error(apiErrorMessage(error, 'Could not add this place to your favourites'))
    } finally {
      isSaving.value = false
    }
  }

  // renaming
  const renaming = ref<Favourite | null>(null)
  const newLabel = ref<string | null>('')
  const isRenaming = ref(false)

  function startRename (f: Favourite) {
    renaming.value = f
    newLabel.value = f.label ?? ''
  }

  async function saveRename () {
    if (!renaming.value || isRenaming.value) {
      return
    }
    isRenaming.value = true
    try {
      await favouriteStore.rename(renaming.value.id, newLabel.value?.trim() || null)
      renaming.value = null
    } catch (error) {
      console.error('Error renaming favourite', error)
      alertStore.error(apiErrorMessage(error, 'Could not rename this favourite'))
    } finally {
      isRenaming.value = false
    }
  }

  const removingId = ref<number | null>(null)

  async function remove (f: Favourite) {
    removingId.value = f.id
    try {
      await favouriteStore.remove(f.id)
    } catch (error) {
      console.error('Error removing favourite', error)
      alertStore.error(apiErrorMessage(error, 'Could not remove this favourite'))
    } finally {
      removingId.value = null
    }
  }

  onMounted(async () => {
    // reload so places removed from CampusGo are cleaned up and details are current
    const [loaded] = await Promise.allSettled([listLocations(), favouriteStore.refresh()])
    if (loaded.status === 'fulfilled') {
      locations.value = loaded.value
    }
    isLoading.value = false
  })
</script>
