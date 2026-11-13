<template>
  <v-form ref="formRef" @submit.prevent="onSubmit">
    <h2 class="text-h6 mb-4">Enter a valid code</h2>

    <v-text-field
      v-model="code"
      label="Invite Code"
      placeholder="Invite Code"
      variant="outlined"
      density="comfortable"
      :rules="rules"
      :disabled="isLoading"
      validate-on="blur"
      autocomplete="off"
    />

    <div class="d-flex justify-end mt-2">
        <v-btn type="submit" color="primary" :loading="isLoading">
          Submit
        </v-btn>
    </div>
  </v-form>
</template>

<script setup lang="ts">
import { acceptInviteCode } from '@/api/auth';
import { tryRefreshToken } from '@/api/http';
import { useAlertStore } from '@/stores/alerts'
import { formatApiError } from '@/util/zodErrorFormatter';
import { ref } from 'vue'
import type { VForm } from 'vuetify/components'

const alertStore = useAlertStore();

const formRef = ref<VForm | null>(null);
const code = ref("");
const isLoading = ref(false);

const rules = [
  (v: string) => (v.trim().length > 0) || "Code is required",
];

async function onSubmit() {
  const result = await formRef.value?.validate();
  if (!result?.valid && !isLoading.value)
    return;

  isLoading.value = true;
  try {
    await acceptInviteCode(code.value.trim());
    alertStore.success("You are now an admin!");
    await tryRefreshToken();
    code.value = "";
    formRef.value?.resetValidation();
  } catch (e) {
    const msg = formatApiError((<any>e)?.response?.data ?? "Unexpected error occurred");
    alertStore.error(msg);
  } finally {
    isLoading.value = false;
  }
}
</script>