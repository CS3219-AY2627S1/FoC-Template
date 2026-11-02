/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-13
 * Mode: Implementation.
 * Scope: Generated or updated frontend code for the team-specified report form, order association, navigation, and completion reminder.
 * Author review: I reviewed for correctness
 */
/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-09-28
 * Mode: Code generation.
 * Scope: Added the team-specified sidebar navigation order and Post Request action.
 * Author review: I reviewed for correctness and edited where needed.
 */
import {
  BikeIcon,
  FlagIcon,
  CircleUserRound,
  ClipboardListIcon,
  PlusIcon,
  SearchIcon,
  StoreIcon,
  TriangleAlertIcon,
  type LucideIcon,
} from "lucide-react"

export type NavItem = {
  href: string
  label: string
  description: string
  icon: LucideIcon
}

// Each service owner registers the UI entry point for their feature here. The
// sidebar-specific ordering below composes these existing feature entries.
// Example:
//   { href: "/suppliers", label: "Suppliers", description: "...", icon: StoreIcon },
export const NAV_ITEMS: NavItem[] = [
  {
    href: "/profile",
    label: "Profile",
    description: "View your account information here.",
    icon: CircleUserRound,
  },
  {
    href: "/suppliers",
    label: "Suppliers",
    description: "Browse campus stores, facilities and landmarks for pickups and deliveries.",
    icon: StoreIcon,
  },
]

// These items are specific to the authenticated sidebar.
export const SIDEBAR_NAV_ITEMS: NavItem[] = [
  {
    href: "/errands",
    label: "Browse Errands",
    description: "Find errands available for delivery.",
    icon: SearchIcon,
  },
  {
    href: "/my-errands",
    label: "My Errands",
    description: "Track the errands you are delivering.",
    icon: BikeIcon,
  },
  {
    href: "/my-requests",
    label: "My Requests",
    description: "Track the requests you have posted.",
    icon: ClipboardListIcon,
  },
  {
    href: "/reporting",
    label: "Report an Issue",
    description: "Report an order or a general issue.",
    icon: TriangleAlertIcon,
  },
  ...NAV_ITEMS,
]

export const POST_REQUEST_ITEM: NavItem = {
  href: "/requests/new",
  label: "Post Request",
  description: "Ask someone on campus to complete an errand.",
  icon: PlusIcon,
}

export const ADMIN_NAV_ITEMS: NavItem[] = [
  { href: "/admin/reports", label: "Reports", description: "Review delivery reports.", icon: FlagIcon },
  { href: "/admin/orders", label: "Orders", description: "View and search all orders.", icon: ClipboardListIcon },
  { href: "/admin/users", label: "Users", description: "Manage user access.", icon: CircleUserRound },
  { href: "/admin/suppliers", label: "Suppliers", description: "Manage campus locations.", icon: StoreIcon },
]
