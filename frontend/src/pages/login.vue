<!-- AI assistance (19/9/2026): deepseek -->
<!-- generate styling and layout of page with dynamic elements. I cleaned up the code + formatting and did the missing pieces of integration. -->
<template>
  <v-container class="auth-page" fluid>
    <v-card class="auth-card" width="100%" max-width="460" rounded="xl" elevation="12">
      <div class="auth-viewport" :style="{ height: viewportHeight }">
        <!-- ============================ LOGIN ============================ -->
        <section
          ref="loginPane"
          class="auth-pane auth-pane--login"
          :class="{ 'is-active': mode === 'login' }"
          :inert="mode !== 'login' ? true : undefined"
          aria-label="Login form"
        >
          <div class="pa-8 pa-sm-10">
            <div class="text-center mb-6">
              <v-avatar color="primary" size="56" class="mb-4" variant="tonal">
                <v-icon size="28">mdi-lock-outline</v-icon>
              </v-avatar>
              <h1 class="text-h5 font-weight-bold">Welcome back</h1>
              <p class="text-body-2 text-medium-emphasis mt-1">
                Sign in
              </p>
            </div>

            <v-form @submit.prevent="handleLogin">
              <v-text-field
                v-model="loginForm.email"
                label="Email"
                type="email"
                variant="outlined"
                density="comfortable"
                prepend-inner-icon="mdi-email-outline"
                autocomplete="email"
                :error-messages="loginErrors.email"
                :disabled="loginLoading"
                @blur="validateLoginField('email')"
              />

              <v-text-field
                v-model="loginForm.password"
                label="Password"
                :type="showLoginPassword ? 'text' : 'password'"
                variant="outlined"
                density="comfortable"
                prepend-inner-icon="mdi-lock-outline"
                :append-inner-icon="showLoginPassword ? 'mdi-eye-off-outline' : 'mdi-eye-outline'"
                autocomplete="current-password"
                :error-messages="loginErrors.password"
                :disabled="loginLoading"
                @click:append-inner="showLoginPassword = !showLoginPassword"
                @blur="validateLoginField('password')"
              />

              <v-btn
                type="submit"
                color="primary"
                size="large"
                block
                rounded="lg"
                class="mt-2"
                :loading="loginLoading"
              >
                Login
              </v-btn>

              <v-btn
                variant="outlined"
                color="primary"
                size="large"
                block
                rounded="lg"
                class="mt-3"
                :disabled="loginLoading"
                @click="goToRegister"
              >
                Register
              </v-btn>
            </v-form>

          </div>
        </section>

        <!-- =========================== REGISTER =========================== -->
        <section
          ref="registerPane"
          class="auth-pane auth-pane--register"
          :class="{ 'is-active': mode === 'register' }"
          :inert="mode !== 'register' ? true : undefined"
          aria-label="Registration form"
        >
          <div class="pa-8 pa-sm-10">
            <div class="text-center mb-6">
              <v-avatar color="primary" size="56" class="mb-4" variant="tonal">
                <v-icon size="28">mdi-account-plus-outline</v-icon>
              </v-avatar>
              <h1 class="text-h5 font-weight-bold">Create account</h1>
              <p class="text-body-2 text-medium-emphasis mt-1">
                It only takes a minute to get started
              </p>
            </div>

            <v-form @submit.prevent="handleRegister">
              <v-text-field
                v-model="registerForm.email"
                label="Email"
                type="email"
                variant="outlined"
                density="comfortable"
                prepend-inner-icon="mdi-email-outline"
                autocomplete="email"
                :error-messages="registerErrors.email"
                :disabled="registerLoading"
                @blur="validateRegisterField('email')"
              />

              <v-text-field
                v-model="registerForm.password"
                label="Password"
                :type="showRegisterPassword ? 'text' : 'password'"
                variant="outlined"
                density="comfortable"
                prepend-inner-icon="mdi-lock-outline"
                :append-inner-icon="showRegisterPassword ? 'mdi-eye-off-outline' : 'mdi-eye-outline'"
                autocomplete="new-password"
                :error-messages="registerErrors.password"
                :disabled="registerLoading"
                @click:append-inner="showRegisterPassword = !showRegisterPassword"
                @blur="validateRegisterField('password')"
              />

              <!-- ---------- Static password requirements ---------- -->
              <v-sheet
                class="pa-4 mb-5 rounded-lg"
                variant="tonal"
              >
                <div class="d-flex align-center ga-2 mb-2">
                  <v-icon size="16" color="medium-emphasis">mdi-shield-key-outline</v-icon>
                  <span class="text-caption font-weight-medium text-medium-emphasis">
                    Password requirements
                  </span>
                </div>
                <ul class="rule-list">
                  <li
                    v-for="rule in PASSWORD_RULES"
                    :key="rule"
                    class="d-flex align-center ga-2"
                  >
                    <v-icon size="14" color="medium-emphasis">mdi-circle-small</v-icon>
                    <span class="text-caption text-medium-emphasis">{{ rule }}</span>
                  </li>
                </ul>
              </v-sheet>

              <v-btn
                type="submit"
                color="primary"
                size="large"
                block
                rounded="lg"
                :loading="registerLoading"
              >
                Register
              </v-btn>

              <v-btn
                variant="text"
                color="primary"
                size="large"
                block
                rounded="lg"
                class="mt-3"
                :disabled="registerLoading"
                @click="goToLogin"
              >
                Back to login
              </v-btn>
            </v-form>
          </div>
        </section>
      </div>
    </v-card>

  </v-container>
</template>

<script setup lang="ts">
import { analysePasswordCategories } from '@/util/password'
import { nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { z } from 'zod'
import { register } from "@/api/auth";
import { formatApiError } from '@/util/zodErrorFormatter';
import { useAuthStore } from '@/stores/auth';
import { useAlertStore } from '@/stores/alerts';
import { useRouter } from 'vue-router';

const loginSchema = z.object({
  email: z
    .string()
    .min(1, 'Email is required')
    .email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

const REGISTER_MIN_CATEGORIES = 3;
const registerSchema = z.object({
  email: z
    .string()
    .min(1, 'Email is required')
    .email('Enter a valid email address'),
  password: z
    .string()
    .min(12, 'Password is least 12 characters')
    .refine(
        s => analysePasswordCategories(s).uniqueCategoriesPresent >= REGISTER_MIN_CATEGORIES,
        `Password must contain at least ${REGISTER_MIN_CATEGORIES} unique categories`
    )
});

const PASSWORD_RULES: readonly string[] = [
  "Password is least 12 characters",
  "Password must contain characters from 3 of 4 unique categories (A-Z, a-z, 0-9, other symbols)"
];

function validate<T extends z.ZodTypeAny>(schema: T, data: unknown): Record<string, string> {
  const result = schema.safeParse(data);
  if (result.success)
    return {};

  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = String(issue.path[0] ?? '');
    if (key && !errors[key]) errors[key] = issue.message;
  }
  return errors;
}

function applyErrors(target: Record<string, string>, errors: Record<string, string>) {
  Object.keys(target).forEach(key => (target[key] = ''));
  Object.assign(target, errors);
}

// STATE
type Mode = 'login' | 'register';

const mode = ref<Mode>('login');

const loginForm = reactive({ email: '', password: '' });
const registerForm = reactive({ email: '', password: ''});

const loginErrors = reactive<Record<string, string>>({ email: '', password: '' });
const registerErrors = reactive<Record<string, string>>({ email: '', password: '' });

const loginLoading = ref(false);
const registerLoading = ref(false);

const showLoginPassword = ref(false);
const showRegisterPassword = ref(false);

// SLIDE-OVER LAYOUT (keeps the card height in sync with the active pane)
const viewportHeight = ref('auto');
const loginPane = ref<HTMLElement | null>(null);
const registerPane = ref<HTMLElement | null>(null);

let resizeObserver: ResizeObserver | null = null;

function syncHeight() {
  const el = mode.value === 'login' ? loginPane.value : registerPane.value;
  if (el) viewportHeight.value = `${el.offsetHeight}px`;
}

onMounted(() => {
  syncHeight()
  resizeObserver = new ResizeObserver(syncHeight);
  if (loginPane.value) resizeObserver.observe(loginPane.value);
  if (registerPane.value) resizeObserver.observe(registerPane.value);
  window.addEventListener('resize', syncHeight);
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  window.removeEventListener('resize', syncHeight);
})

watch(mode, () => nextTick(syncHeight));

// ui actions
function validateLoginField(field: 'email' | 'password') {
  const result = loginSchema.shape[field].safeParse(loginForm[field]);
  loginErrors[field] = result.success ? '' : (result.error.issues[0]?.message ?? '');
}

function validateRegisterField(field: 'email' | 'password') {
  const result = registerSchema.shape[field].safeParse(registerForm[field]);
  registerErrors[field] = result.success ? '' : (result.error.issues[0]?.message ?? '');
}

function goToRegister() {
  registerForm.email = loginForm.email;
  registerForm.password = '';
  applyErrors(registerErrors, {});
  mode.value = 'register';
}

function goToLogin() {
  applyErrors(loginErrors, {});
  mode.value = 'login';
}

// integration
const authStore = useAuthStore();
const alertStore = useAlertStore();
const router = useRouter();

async function handleLogin() {
  const errors = validate(loginSchema, loginForm);
  applyErrors(loginErrors, errors);
  if (Object.keys(errors).length > 0)
    return;

  loginLoading.value = true;
  try {
    await authStore.login(loginForm.email, loginForm.password);
    // goto dashboard on successful login
    router.push({ name: "dashboard" });
  } catch (error) {
    const data = (<any>error)?.response?.data;
    alertStore.error(data ? formatApiError(data) : 'Something went wrong. Please try again.');
  } finally {
    loginLoading.value = false;
  }
}

async function handleRegister() {
  const errors = validate(registerSchema, registerForm);
  applyErrors(registerErrors, errors)
  if (Object.keys(errors).length > 0)
    return;

  registerLoading.value = true;
  try {
    await register(registerForm.email, registerForm.password);
    alertStore.success(`Account registered!`);
    goToLogin();
  } catch (error) {
    const data = (<any>error)?.response?.data;
    alertStore.error(data ? formatApiError(data) : 'Something went wrong. Please try again.');
  } finally {
    registerLoading.value = false;
  }
}

</script>

<style scoped>
.auth-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: linear-gradient(135deg, #eef2ff 0%, #f8fafc 50%, #e8f4ff 100%);
}

.auth-card {
  overflow: hidden;
}

/* ---------- Slide-over viewport ---------- */
.auth-viewport {
  position: relative;
  overflow: hidden;
  transition: height 0.45s cubic-bezier(0.4, 0, 0.2, 1);
}

.auth-pane {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  background: rgb(var(--v-theme-surface));
  transition: transform 0.45s cubic-bezier(0.4, 0, 0.2, 1);
  will-change: transform;
}

/* Login sits underneath, never moves. */
.auth-pane--login {
  z-index: 1;
  transform: translateX(0);
}

/* Register starts off-screen to the right and slides OVER the login form. */
.auth-pane--register {
  z-index: 2;
  transform: translateX(100%);
}

.auth-pane--register.is-active {
  transform: translateX(0);
}

.rule-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 2px;
}
</style>
