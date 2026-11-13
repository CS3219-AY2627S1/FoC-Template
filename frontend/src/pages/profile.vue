<script lang="ts" setup>

// TODO: Get the logged-in user’s ID from your authentication state.
// Fetch their existing details with GET /api/public/user/user/${userId}.
// Populate the form with those details.
// On Save, validate and send the changes to PUT /api/public/user/user/${userId}

  import { ref } from 'vue'
  import { z } from 'zod'
  import { useAuthStore } from '@/stores/auth'
  import http from '@/api/http'
  import type { UserProfile } from '@/api/user'
  import { getUser } from '@/api/user'
  import { updateUser } from '@/api/user'
  import { onMounted } from 'vue'
import AdminInviteForm from '@/components/AdminInviteForm.vue'

  const auth = useAuthStore()
  const NICKNAME_MAX_LENGTH = 25
  let userId: string

  const profileSchema = z.object({
    nickname: z.string().max(25, 'Name must be 25 characters or fewer.'),
    contact: z.e164('Use international format, e.g. +6581234567.').nullable(),
  })

  const errors = ref<Record<string, string>>({})

  const fields = ref([
    { id: 'name', label: 'Name', type: 'text', value: '' },
    { id: 'email', label: 'Email', type: 'email', value: '' },
    { id: 'phone', label: 'Phone', type: 'tel', value: '' },
  ])

  const isEditable = ref(false)

  async function loadProfile(): Promise<void> {
    if (!auth.userId) return

    try {
      userId = auth.userId
      const user: UserProfile = await getUser(userId)

      for (const field of fields.value) {
        if (field.id === 'name') field.value = user.nickname
        if (field.id === 'email') field.value = user.email
        if (field.id === 'phone') field.value = user.contact ?? ''
      }
    } catch (error) {
      console.error('Error loading profile', error)
    }
  }

  onMounted(loadProfile)

  function handleEdit(): void {
    isEditable.value = true
  }

  async function handleSave(): Promise<void> {
    errors.value = {}

    const result = profileSchema.safeParse({
      nickname: fields.value.find(field => field.id === 'name')!.value,
      contact: fields.value.find(field => field.id === 'phone')!.value || null,
    })

    if (!result.success) {
      for (const issue of result.error.issues) {
        const fieldId = issue.path[0] === 'nickname' ? 'name' : 'phone'
        errors.value[fieldId] = issue.message
      }
      return
    }

    try {
      await updateUser(userId, result.data)
    } catch (error) {
      console.error('Error updating user', error)
    }
    isEditable.value = false
  }

</script>

<template>
  <main class="min-h-full bg-gray-50 px-4 py-8">
    <section
      aria-labelledby="profile-heading"
      class="mx-auto max-w-xl rounded-2xl bg-white p-6 pb-6 shadow-sm"
    >

      <div class="flex flex-row align-center justify-between bg-white">
        <h1 id="profile-heading" class="text-2xl font-semibold text-gray-900">
          My Profile
        </h1>

        <v-btn aria-label="Edit profile" type="button" @click="handleEdit" append-icon="mdi-pencil" size="30">
        </v-btn>
      </div>

      <p class="mt-2 text-sm text-gray-500">
        View and update your personal details.
      </p>
      
      <v-theme-provider theme="light">
        <v-expansion-panels variant="accordion">
          <v-expansion-panel v-if="!auth.isAdmin">
            <v-expansion-panel-title>
              <span class="text-subtitle-1 font-weight-medium">Admin Invitation Programme</span>
            </v-expansion-panel-title>
  
            <v-expansion-panel-text>
              <admin-invite-form/>
            </v-expansion-panel-text>
          </v-expansion-panel>
        </v-expansion-panels>
      </v-theme-provider>

      <div class="mt-8 space-y-5">
        <div
          v-for="field in fields"
          :key="field.id"
          class="flex flex-col gap-2"
        >
          <label class="text-sm font-medium text-gray-700" :for="field.id">
            {{ field.label }}
          </label>

          <input
            :id="field.id"
            v-model="field.value"
            :aria-describedby="errors[field.id] ? `${field.id}-error` : undefined"
            :aria-invalid="Boolean(errors[field.id])"
            class="
              w-full rounded-lg border border-solid border-gray-300 bg-white
              px-3 py-2.5 text-base text-gray-900
              read-only:bg-gray-100 read-only:text-gray-600
              read-write:border-violet-400 read-write:bg-violet-50
              focus:border-violet-500 focus:outline-none
              focus:ring-2 focus:ring-violet-200
            "
            :readonly="field.id === 'email' || !isEditable"
            :type="field.type"
          >

        </div>
      </div>

      <div class="flex flex-row justify-between">
        <div class="mt-8 text-red-600">
          <span v-for="(error, fieldId) in errors" :key="fieldId" class="block">
            {{ error }}
          </span>
        </div>

        <div class="mt-8 flex justify-end">
          <v-btn
            color="primary"
            :disabled="!isEditable"
            type="button"
            @click="handleSave"
          >
            Save
          </v-btn>
        </div>
      </div>
    </section>
  </main>
</template>
