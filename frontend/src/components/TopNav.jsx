/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-opus-5), date: 2026-09-08
 * Scope: Generated UI mockup component TopNav.jsx from team-authored blueprint.md.
 *        Visual/layout implementation only. No requirements, architecture, or
 *        schema decisions were made by the AI tool.
 * Author review: <pending — team member to sign>
 *
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-09-30
 * Scope: Shows a 'Manage suppliers' link when the demo role is Admin. No requirements, architecture, schema, or API decisions were
 *        made by the AI tool.
 * Author review: Congchen
 *
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-09-30
 * Scope: The nav shows the logged-in username and initials from the session, logs out through the User Service, and shows the admin link only for admin and super admin accounts. No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 *
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-10-02
 * Scope: Added a Log out button to the desktop nav (it was only in the mobile menu), wired to the existing logout. No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-10-22
 * Scope: Per instructions.md Stage 16b: reads session/credits/logout/isAdmin from the new
 *        AuthContext instead of DemoContext. Added the "Manage users" admin link next to
 *        "Manage suppliers" (per the user's answer to 16a item 1). The special-cased
 *        `gated` nav link and its onClick handler are gone: /activity is now wrapped in
 *        RequireAuth at the route level, so clicking the link while logged out lands on
 *        /login the same way opening the URL directly does. The two "Log in" buttons now
 *        call requireAuth (AuthContext's replacement for the deleted LoginModal's
 *        requireLogin) instead of opening a modal.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-10-23
 * Scope: Per instructions.md Stage 16e ("linked from the nav"): the username/initials block
 *        (desktop and mobile) is now a link to /account instead of plain text, since that was
 *        the only place in the nav that already identified the signed-in user. The Log out
 *        control stays a separate control, not swallowed into the link.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-10-23
 * Scope: Per instructions.md Stage 16f: added ActiveViewToggle next to the credits pill
 *        (desktop) and above the username row (mobile drawer), shown only when logged in.
 *        Minimal placement only — Gabriel may adjust the layout.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-05
 * Scope: Per instructions.md Stage 22's "Nav bar" rows: the fixed LINKS list is replaced by
 *        routing/views.js's NAV_LINKS, keyed by the signed-in user's active view, so the nav
 *        shows only the current view's two pages (plus the admin links for admins) and the
 *        other view's are hidden. Logged out, the nav shows no page links and a Register
 *        button alongside the existing Log in button (both desktop and the mobile drawer).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-06
 * Scope: Added the "Audit log" admin link (/admin/logs), per instructions.md Stage 26e. Same
 *        visibility as the other admin links (isAdmin, both views).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 * Scope (2026-11-08, Codex, model: GPT-6): Connected the team-requested frontend chat entry points and existing HTTP contracts.
 * Author review: tng wen xi
 * Scope (2026-11-08, Codex, model: GPT-6): Added the requested /chats list with titles, previews and conversation navigation.
 * Author review: tng wen xi
 * Scope (2026-11-08, Codex, model: GPT-6): Added or tested a total unread badge on the top chat icon.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: tng wen xi
 * Scope (2026-11-08, Codex, model: GPT-6): Moved or tested live unread counts on the floating chat shortcut and removed the top shortcut.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: tng wen xi
 * Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-10
 * Scope: Removed the notification bell button from the desktop nav, per George's chat instruction
 *        (notifications are delivered through the chat system). No requirements, architecture,
 *        schema, or API decisions were made by the AI tool.
 * Author review: George Yeo
 */

import { useEffect, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { LogOut, Menu, X } from "lucide-react";
import Logo from "./Logo";
import Button from "./Button";
import CreditPill from "./CreditPill";
import ActiveViewToggle from "./ActiveViewToggle";
import { useAuth } from "../context/AuthContext";
import { NAV_LINKS } from "../routing/views";

const ADMIN_LINKS = [
  { to: "/admin/suppliers", label: "Manage suppliers" },
  { to: "/admin/users", label: "Manage users" },
  { to: "/admin/logs", label: "Audit log" },
];

export default function TopNav() {
  const { isLoggedIn, user, credits, requireAuth, logout, isAdmin } = useAuth();
  const links = isLoggedIn ? NAV_LINKS[user.activeView] : [];
  const linksWithAdmin = isAdmin ? [...links, ...ADMIN_LINKS] : links;
  const displayName = user?.username ?? "";
  const initials = displayName.slice(0, 2).toUpperCase();
  const [scrolled, setScrolled] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  const navLinkClass = ({ isActive }) =>
    "text-sm font-medium transition-colors duration-150 " +
    (isActive ? "text-ink" : "text-ink-70 hover:text-ink");

  return (
    <>
      <header
        className={
          "sticky top-0 z-40 h-16 bg-surface transition-shadow duration-150 " +
          (scrolled ? "border-b border-line shadow-nav" : "")
        }
      >
        <div className="page-width page-gutter flex h-16 items-center justify-between gap-4">
          <Logo />

          <nav className="hidden items-center gap-8 lg:flex" aria-label="Main">
            {linksWithAdmin.map((link) => (
              <NavLink key={link.to} to={link.to} className={navLinkClass}>
                {link.label}
              </NavLink>
            ))}
          </nav>

          <div className="hidden items-center gap-3 md:flex">
            {isLoggedIn ? (
              <>
                <ActiveViewToggle />
                <Link
                  to="/wallet"
                  aria-label={credits.available + " credits available"}
                >
                  <CreditPill value={credits.available} size="md" />
                </Link>
                <Link
                  to="/account"
                  className="flex h-10 items-center gap-2 rounded-btn px-1.5 hover:bg-surface-alt"
                >
                  <span className="text-sm font-medium text-ink">
                    {displayName}
                  </span>
                  <span className="flex h-8 w-8 items-center justify-center rounded-pill bg-surface-alt text-xs font-semibold text-ink">
                    {initials}
                  </span>
                </Link>
                <button
                  type="button"
                  className="flex h-10 items-center gap-1.5 rounded-btn px-2 text-sm text-ink-70 hover:bg-surface-alt hover:text-ink"
                  onClick={logout}
                >
                  <LogOut size={16} aria-hidden="true" />
                  Log out
                </button>
              </>
            ) : (
              <>
                <Button variant="secondary" size="sm" as={Link} to="/register">
                  Register
                </Button>
                <Button
                  size="sm"
                  onClick={() =>
                    requireAuth("Log in to post and accept errands.")
                  }
                >
                  Log in
                </Button>
              </>
            )}
          </div>

          <button
            type="button"
            className="flex h-11 w-11 items-center justify-center rounded-btn text-ink md:hidden"
            aria-label={drawerOpen ? "Close menu" : "Open menu"}
            aria-expanded={drawerOpen}
            onClick={() => setDrawerOpen((v) => !v)}
          >
            {drawerOpen ? (
              <X size={20} aria-hidden="true" />
            ) : (
              <Menu size={20} aria-hidden="true" />
            )}
          </button>
        </div>
      </header>

      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-black/40"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="foc-fade absolute right-0 top-0 flex h-full w-[280px] flex-col gap-6 bg-surface p-5 shadow-modal">
            <div className="flex items-center justify-between">
              <Logo />
              <button
                type="button"
                className="flex h-11 w-11 items-center justify-center rounded-btn text-ink"
                aria-label="Close menu"
                onClick={() => setDrawerOpen(false)}
              >
                <X size={20} aria-hidden="true" />
              </button>
            </div>

            {isLoggedIn && (
              <>
                <ActiveViewToggle className="self-start" />
                <Link
                  to="/wallet"
                  className="flex items-center gap-3 rounded-card border border-line p-3"
                >
                  <CreditPill value={credits.available} size="md" />
                  <span className="text-sm text-ink-70">available</span>
                </Link>
              </>
            )}

            <nav className="flex flex-col" aria-label="Mobile">
              {linksWithAdmin.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  className="flex min-h-[44px] items-center border-b border-line text-base font-medium text-ink"
                >
                  {link.label}
                </NavLink>
              ))}
            </nav>

            <div className="mt-auto">
              {isLoggedIn ? (
                <div className="flex items-center gap-3">
                  <Link
                    to="/account"
                    className="flex items-center gap-3 min-w-0"
                  >
                    <span className="flex h-10 w-10 items-center justify-center rounded-pill bg-surface-alt text-sm font-semibold text-ink">
                      {initials}
                    </span>
                    <p className="truncate text-sm font-medium text-ink">
                      {displayName}
                    </p>
                  </Link>
                  <button
                    type="button"
                    className="text-xs text-ink-40 hover:text-ink"
                    onClick={logout}
                  >
                    Log out
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <Button
                    size="lg"
                    className="w-full"
                    onClick={() => {
                      setDrawerOpen(false);
                      requireAuth("Log in to post and accept errands.");
                    }}
                  >
                    Log in
                  </Button>
                  <Button
                    variant="secondary"
                    size="lg"
                    className="w-full"
                    as={Link}
                    to="/register"
                    onClick={() => setDrawerOpen(false)}
                  >
                    Register
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
