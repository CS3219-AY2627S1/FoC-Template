import { hasAdminRole } from './hasAdminRole'

/** admin users after login will be redirect to admin dashboard page */
export const getHomePath = () => (hasAdminRole() ? '/admin' : '/home')
