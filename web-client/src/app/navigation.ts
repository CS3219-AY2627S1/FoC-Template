import { CirclePlus, Coins, Flag, List, Package, Store, User, Users, Wallet, MessageSquareText } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export type NavItem = {
  to: string
  label: string
  icon: LucideIcon
  // A shorter label where space is tight, like the mobile tab bar.
  shortLabel?: string
  // Only active on exactly this path, so "Errands" is not also highlighted on /errands/new.
  end?: boolean
}

// Each path must match a route in a feature's routes.ts. Renaming a route means changing it here too.
export const appNav: NavItem[] = [
  { to: '/errands', label: 'Errands', icon: Package, end: true },
  { to: '/errands/new', label: 'Post an errand', shortLabel: 'Post', icon: CirclePlus },
  { to: '/wallet', label: 'Wallet', icon: Wallet },
  { to: '/message', label: 'Messages', icon: MessageSquareText },
  { to: '/profile', label: 'Profile', icon: User },
]

export const adminNav: NavItem[] = [
  { to: '/admin/orders', label: 'Orders', icon: List },
  { to: '/admin/students', label: 'Students', icon: Users },
  { to: '/admin/reports', label: 'Reports', icon: Flag },
  { to: '/admin/suppliers', label: 'Suppliers', icon: Store },
  { to: '/admin/credits', label: 'Credits', icon: Coins },
]