export const ROUTES = {
    // Public routes
    LOGIN: "/",
    REGISTER: "/register",
    ACTIVATE_ADMIN: "/activate-admin",

    // Protected routes for student roles
    REQUESTER_ACTIVITY: "/requester-activity",
    COURIER_ACTIVITY: "/courier-activity",
    CREDITS: "/credits",

    // Protected routes for admin roles
    ADMIN: {
        MANAGE_USERS: "/admin/manage-users",
        MANAGE_SUPPLIERS: "/admin/manage-suppliers",
        MANAGE_SUPPLIER_TYPES: "/admin/supplier-types",
        MANAGE_ORDERS: "/admin/manage-orders",
    },

    // Protected routes for both student and admin roles
    HOME: "/home",
    SUPPLIERS: "/suppliers",
    PROFILE: "/profile",

} as const;
