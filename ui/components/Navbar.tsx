import type { User, Page } from "../App"

interface NavbarProps {
  user: User
  currentPage: Page
  onNavigate: (page: Page) => void
  onLogout: () => void
}

type NavItem = {
  label: string
  mobileLabel: string
  page: Page
  icon: "mine" | "orders" | "create" | "activity" | "store"
}

const navItems: NavItem[] = [
  { label: "Orders", mobileLabel: "Find Errand", page: "orders", icon: "orders" },
  { label: "Create Request", mobileLabel: "Create", page: "create-request", icon: "create" },
  { label: "Suppliers", mobileLabel: "Stores", page: "suppliers", icon: "store" },
  { label: "My Orders", mobileLabel: "My Orders", page: "my-orders", icon: "mine" },
  { label: "Profile", mobileLabel: "Profile", page: "profile", icon: "activity" },
]

function NavIcon({ icon }: { icon: NavItem["icon"] }) {
  const paths = {
    orders: (
      <>
        <path d="M8 6h13M8 12h13M8 18h13" />
        <path d="M3.5 6h.01M3.5 12h.01M3.5 18h.01" strokeWidth="3" />
      </>
    ),
    mine: (
      <>
        <rect x="5" y="4" width="14" height="17" rx="2" />
        <path d="M9 3h6v3H9zM9 11h6M9 15h4" />
      </>
    ),
    create: (
      <>
        <path d="M12 5v14M5 12h14" />
        <circle cx="12" cy="12" r="9" />
      </>
    ),
    store: (
      <>
        <path d="M4 10h16l-1.5-5h-13z" />
        <path d="M5 10v10h14V10M10 20v-5h4v5" />
      </>
    ),
    activity: (
      <>
        <circle cx="12" cy="8" r="3" />
        <path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
      </>
    ),
  }

  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[icon]}
    </svg>
  )
}

export default function Navbar({ user, currentPage, onNavigate }: NavbarProps) {
  const initials = user.name.split(" ").map((n) => n[0]).join("").slice(0, 2)
  const activePage =
    currentPage === "create-success"
      ? "create-request"
      : ["order-details", "accepted-order", "errand-complete"].includes(currentPage)
        ? "orders"
        : currentPage

  return (
    <header className="sticky top-0 z-40 border-b border-[#E4E8E6] bg-white pt-[env(safe-area-inset-top,0px)]">
      <div className="mx-auto flex min-h-14 w-full max-w-6xl items-center justify-between gap-2 py-2 pl-[max(0.75rem,env(safe-area-inset-left,0px))] pr-[max(0.75rem,env(safe-area-inset-right,0px))] sm:min-h-16 sm:gap-4 sm:pl-[max(1.5rem,env(safe-area-inset-left,0px))] sm:pr-[max(1.5rem,env(safe-area-inset-right,0px))] lg:pl-[max(2rem,env(safe-area-inset-left,0px))] lg:pr-[max(2rem,env(safe-area-inset-right,0px))]">
        {/* Logo */}
        <button
          onClick={() => onNavigate("orders")}
          className="flex min-w-0 flex-shrink items-center gap-2 transition-opacity hover:opacity-80"
        >
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-[#1A4A36]">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <span className="truncate text-sm font-semibold tracking-tight text-[#162A46] sm:text-base">Campus Dash</span>
        </button>

        {/* Center nav */}
        <nav className="hidden md:flex items-center gap-0.5">
          {navItems.map(({ label, page }) => (
            <button
              key={page}
              onClick={() => onNavigate(page)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                activePage === page
                  ? "bg-[#E8F1ED] text-[#1A4A36]"
                  : "text-[#1B2522] hover:bg-[#F7F9F8] hover:text-[#1A4A36]"
              }`}
            >
              {label}
            </button>
          ))}
        </nav>

        {/* Right */}
        <div className="flex flex-shrink-0 items-center gap-1.5 sm:gap-2">
          {user.isAdmin && (
            <button
              onClick={() => onNavigate("admin")}
              className="rounded-full border border-[#E4E8E6] px-2.5 py-1.5 text-xs font-semibold text-[#162A46] transition-colors hover:border-[#3F6B5A] sm:px-3"
            >
              Admin
            </button>
          )}
          <div className="flex items-center gap-1.5 rounded-full bg-[#E8F1ED] px-2 py-1.5 text-xs font-semibold whitespace-nowrap text-[#1A4A36] sm:px-3">
            <svg className="h-3 w-3 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm.75 14.25h-1.5v-5.5h1.5v5.5zm0-7h-1.5v-1.5h1.5v1.5z" />
            </svg>
            <span>{user.credits ?? "–"}</span>
            <span className="hidden min-[380px]:inline">Credits</span>
          </div>
          <button
            onClick={() => onNavigate("profile")}
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[#162A46] text-xs font-semibold text-white transition-opacity hover:opacity-90"
            aria-label="Profile"
          >
            {initials}
          </button>
        </div>
      </div>

      {/* Mobile bottom nav */}
      <nav
        aria-label="Primary navigation"
        className="fixed inset-x-0 bottom-0 z-50 flex border-t border-[#E4E8E6] bg-white/95 pl-[max(0.5rem,env(safe-area-inset-left,0px))] pr-[max(0.5rem,env(safe-area-inset-right,0px))] pb-[env(safe-area-inset-bottom,0px)] shadow-[0_-6px_24px_rgba(22,42,70,0.08)] backdrop-blur-md md:hidden"
      >
        {navItems.map(({ mobileLabel, page, icon }) => (
          <button
            key={page}
            onClick={() => onNavigate(page)}
            aria-current={activePage === page ? "page" : undefined}
            className={`relative flex min-h-16 flex-1 flex-col items-center justify-center gap-1 rounded-lg text-[11px] font-medium transition-colors ${
              activePage === page
                ? "text-[#1A4A36]"
                : "text-[#3F6B5A] hover:text-[#1A4A36]"
            }`}
          >
            {activePage === page && (
              <span className="absolute top-0 h-0.5 w-8 rounded-full bg-[#1A4A36]" />
            )}
            <NavIcon icon={icon} />
            <span>{mobileLabel}</span>
          </button>
        ))}
      </nav>
    </header>
  )
}