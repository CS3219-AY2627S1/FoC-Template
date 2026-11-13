import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import {
  addFavourite,
  type Favourite,
  listFavourites,
  type NewFavourite,
  removeFavourite,
  renameFavourite,
} from '@/api/favourite'

/**
 * The signed-in user's favourites, shared by the star buttons, the errand form and the favourites page.
 * Loaded once on first use; every change goes to the user service and then updates the list here.
 */
export const useFavouriteStore = defineStore('favourites', () => {
  const favourites = ref<Favourite[]>([])
  const isLoaded = ref(false)
  const loadFailed = ref(false)

  const suppliers = computed(() => favourites.value.filter(f => f.kind === 'SUPPLIER'))
  const spots = computed(() => favourites.value.filter(f => f.kind === 'LOCATION'))

  let loading: Promise<void> | null = null

  async function refresh () {
    try {
      favourites.value = await listFavourites()
      loadFailed.value = false
    } catch (error) {
      console.error('Error loading favourites', error)
      loadFailed.value = true
    } finally {
      isLoaded.value = true
    }
  }

  // loads the first time only; pages call this on mount
  function ensureLoaded () {
    loading ??= refresh()
    return loading
  }

  function supplierFavourite (supplierId: number) {
    return suppliers.value.find(f => f.targetId === supplierId) ?? null
  }

  // the same building, floor and room (blank matches a favourite without one)
  function spotFavourite (locationId: number, floor: number, room: string) {
    return spots.value.find(f => f.targetId === locationId && f.floor === floor && (f.room ?? '') === room.trim()) ?? null
  }

  async function add (body: NewFavourite) {
    const saved = await addFavourite(body)
    favourites.value = [saved, ...favourites.value.filter(f => f.id !== saved.id)]
    return saved
  }

  async function rename (id: number, label: string | null) {
    const renamed = await renameFavourite(id, label)
    favourites.value = favourites.value.map(f => f.id === id ? { ...f, label: renamed.label } : f)
  }

  async function remove (id: number) {
    await removeFavourite(id)
    favourites.value = favourites.value.filter(f => f.id !== id)
  }

  // on logout
  function reset () {
    favourites.value = []
    isLoaded.value = false
    loadFailed.value = false
    loading = null
  }

  return {
    favourites,
    isLoaded,
    loadFailed,
    suppliers,
    spots,
    refresh,
    ensureLoaded,
    supplierFavourite,
    spotFavourite,
    add,
    rename,
    remove,
    reset,
  }
})
