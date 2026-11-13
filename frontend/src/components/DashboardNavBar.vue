<template>
  <!-- TODO: navigation highlighting and updating of title -->
  <v-layout class="fullscreen">
    <!-- Desktop: an icon rail that expands on hover. Phones and small tablets have no hover,
         so there it is hidden and slides over the page from the menu button instead -->
    <v-navigation-drawer
      :expand-on-hover="!isSmallScreen"
      :model-value="isSmallScreen ? isNavbarOpened : true"
      :permanent="!isSmallScreen"
      :rail="!isSmallScreen"
      :temporary="isSmallScreen"
      @update:model-value="isNavbarOpened = $event"
    >
      <v-list density="compact" nav>
        <v-list-item to="/" prepend-icon="mdi-home" title="Dashboard" exact />
        <v-list-item to="/suppliers" prepend-icon="mdi-store" title="Suppliers" />
        <v-list-item to="/errands/new" prepend-icon="mdi-plus-box-outline" title="Request Errand" />
        <v-list-item to="/errands" prepend-icon="mdi-bike-fast" title="Open Errands" exact />
        <v-list-item to="/my-errands" prepend-icon="mdi-clipboard-list-outline" title="My Errands" />
        <v-list-item to="/favourites" prepend-icon="mdi-star-outline" title="Favourites" />
        <!-- unread messages across all chats, on the icon so it shows on the collapsed rail too -->
        <v-list-item to="/chats" title="Chats">
          <template #prepend>
            <v-badge color="error" :content="chats.totalUnread" floating :model-value="chats.totalUnread > 0">
              <v-icon>mdi-chat-outline</v-icon>
            </v-badge>
          </template>
        </v-list-item>
        <v-list-item v-if="auth.isAdmin" to="/admin/users" prepend-icon="mdi-account-group" title="Users" />
      </v-list>

      <template #append>
        <v-list density="compact" nav>
          <v-list-item
            prepend-icon="mdi-account-circle"
            title="Profile"
            to="/profile"
          />
          <v-list-item
            prepend-icon="mdi-logout"
            title="Log out"
            @click="isLogoutOpen = true"
          />
        </v-list>
      </template>

    </v-navigation-drawer>

    <v-app-bar :order="-1">
      <template v-if="isSmallScreen" v-slot:prepend>
        <v-app-bar-nav-icon @click="isNavbarOpened = !isNavbarOpened" />
      </template>
  
      <v-app-bar-title>Application Bar</v-app-bar-title>

      <!-- the signed-in user's credits: spendable balance, and how much is held for their open errands -->
      <template v-if="auth.isAuthenticated" v-slot:append>
        <v-chip
          class="mr-2"
          color="success"
          prepend-icon="mdi-hand-coin-outline"
          :to="{ name: 'dashboard' }"
          variant="tonal"
        >
          <template v-if="credits.balance !== null">
            {{ credits.balance }} credit{{ credits.balance === 1 ? '' : 's' }}
            <span v-if="credits.onHold > 0" class="ml-1 text-medium-emphasis">· {{ credits.onHold }} on hold</span>
          </template>
          <template v-else-if="credits.problem">Credits unavailable</template>
          <template v-else>Loading credits…</template>
        </v-chip>
      </template>
    </v-app-bar>

    <v-main class="fullscreen">
      <router-view /> 
    </v-main>

    <!-- Confirm before logging out, so a stray click on the menu does not sign the user out -->
    <v-dialog v-model="isLogoutOpen" max-width="400">
      <v-card rounded="lg">
        <v-card-title class="pt-5 px-6">Log out?</v-card-title>
        <v-card-text class="px-6">You will need to log in again to use CampusGo.</v-card-text>

        <v-card-actions class="px-6 pb-4">
          <v-spacer />
          <v-btn variant="text" @click="isLogoutOpen = false">Cancel</v-btn>
          <v-btn color="error" prepend-icon="mdi-logout" variant="flat" @click="logout">Log out</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-layout>
</template>

<script lang="ts" setup>
import { computed, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useDisplay } from 'vuetify';
import { useAuthStore } from '@/stores/auth';
import { useCreditStore } from '@/stores/credit';
import { useChatStore } from '@/stores/chat';
import { useFavouriteStore } from '@/stores/favourites';

// credits change as errands are requested, completed or cancelled
const CREDIT_REFRESH_MS = 30_000;

// The hover rail needs a mouse: on a touchscreen (phones and tablets of any size, where nothing
// un-hovers it after a tap) or below 960 px, the menu slides in from the menu button instead
const { smAndDown } = useDisplay();
const noHover = window.matchMedia('(hover: none)');
const isTouchOnly = ref(noHover.matches);
const onHoverChange = (e: MediaQueryListEvent) => {
  isTouchOnly.value = e.matches;
};
noHover.addEventListener('change', onHoverChange);
onUnmounted(() => noHover.removeEventListener('change', onHoverChange));
const isSmallScreen = computed(() => smAndDown.value || isTouchOnly.value);
const isNavbarOpened = ref(false);
// admins also see the Users page
const auth = useAuthStore();
const credits = useCreditStore();
const router = useRouter();
const route = useRoute();

// on small screens, close the menu once a page is picked so it does not cover the page
watch(() => route.fullPath, () => {
  isNavbarOpened.value = false;
});

// reload credits on every page change and when the user signs in, and every 30 s while the tab is visible
watch([() => route.fullPath, () => auth.userId], () => credits.refresh(), { immediate: true });
const creditTimer = setInterval(() => {
  if (document.visibilityState === 'visible')
    credits.refresh();
}, CREDIT_REFRESH_MS);
onUnmounted(() => clearInterval(creditTimer));

// one live chat connection for the whole app while signed in: new messages and unread counts
// arrive on any page, not only on the chat pages
const chats = useChatStore();
// favourites belong to the signed-in user; forget them when someone else signs in
const favourites = useFavouriteStore();
watch(() => auth.userId, userId => {
  chats.disconnect();
  favourites.reset();
  if (userId)
    chats.connect();
}, { immediate: true });
onUnmounted(() => chats.disconnect());

const isLogoutOpen = ref(false);

// forgets both tokens in this browser, then shows the login page.
// The user service has no logout endpoint yet, so the tokens stay valid until they expire
const logout = async () => {
  isLogoutOpen.value = false;
  await auth.logout();
  router.push({ name: 'login' });
};
</script>

<style scoped>
.fullscreen {
  height: 100%;
  width: 100%;
}
</style>