/**
 * router/index.ts
 *
 * Manual routes for ./src/pages/*.vue
 */

// Composables
import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import Dashboard from '@/pages/dashboard.vue'
import Login from '@/pages/login.vue'
import Profile from '@/pages/profile.vue'
import Suppliers from '@/pages/suppliers.vue'
import SupplierDetail from '@/pages/supplier.vue'
import RequestErrand from '@/pages/request-errand.vue'
import ErrandDetail from '@/pages/errand.vue'
import OpenErrands from '@/pages/open-errands.vue'
import MyErrands from '@/pages/my-errands.vue'
import AdminUsers from '@/pages/admin-users.vue'
import AdminUser from '@/pages/admin-user.vue'
import Chats from '@/pages/chats.vue'
import ChatPage from '@/pages/chat.vue'
import Favourites from '@/pages/favourites.vue'
import DashboardNavBar from '@/components/DashboardNavBar.vue'
import { useAuthStore } from '@/stores/auth';
import { watch } from 'vue';

const routes: RouteRecordRaw[] = [
    {
        path: "/",
        component: DashboardNavBar,
        children: [
            { path: "", name: "dashboard", component: Dashboard },
            { path: "profile", name: "profile", component: Profile },
            { path: "suppliers", name: "suppliers", component: Suppliers },
            { path: "suppliers/:id", name: "supplier", component: SupplierDetail },
            { path: "errands", name: "open-errands", component: OpenErrands },
            { path: "errands/new", name: "request-errand", component: RequestErrand },
            { path: "errands/:id", name: "errand", component: ErrandDetail },
            { path: "my-errands", name: "my-errands", component: MyErrands },
            { path: "chats", name: "chats", component: Chats },
            { path: "chats/:errandId", name: "chat", component: ChatPage },
            { path: "favourites", name: "favourites", component: Favourites },
            // admin only, see the guard below
            { path: "admin/users", name: "admin-users", component: AdminUsers, meta: { isAdminRequired: true } },
            { path: "admin/users/:id", name: "admin-user", component: AdminUser, meta: { isAdminRequired: true } },
        ],
        meta: { isAuthRequired: true }
    },
    { path: '/login', name: "login", component: Login },
];

const router = createRouter({
    history: createWebHistory(import.meta.env.BASE_URL),
    routes,
});

router.beforeEach(route => {
    const auth = useAuthStore();

    // navigation occurs to protected page without stored tokens, redirect to login
    if (route.meta.isAuthRequired && !auth.isAuthenticated) {
        return { path: "/login" };
    }

    if (route.name === "login" && auth.isAuthenticated) {
        return { path: "/" };
    }

    // admin pages; the services check the role again on every request
    if (route.meta.isAdminRequired && !auth.isAdmin) {
        return { name: "dashboard" };
    }
});

/**
 * Edge case: handle redirection in the case where auth changes (during a request) while on a protected page.
 * Workaround: pinia not yet activated (since we are still within plugin init cycle)
 */
export const initCredentialWatcher = () => {
    const auth = useAuthStore();
    watch(
        () => auth.isAuthenticated,
        isAuthed => {
            if (isAuthed)
                return;
            const route = router.currentRoute.value;
            if (route.meta.isAuthRequired) {
                router.push({ path: "/login" });
            }
        }
    )
    // a refreshed token without the admin role (e.g. after being demoted) leaves the admin pages
    watch(
        () => auth.isAdmin,
        isAdmin => {
            if (!isAdmin && auth.isAuthenticated && router.currentRoute.value.meta.isAdminRequired)
                router.push({ name: "dashboard" });
        }
    )
}

export default router
