/*
 * AI Assistance Disclosure
 * Tool and date: OpenAI Codex (gpt-6.1-sol), 2026-11-08
 * Scope (AI-06): Implemented and tested the requested account initials menu.
 * Usage log: AI_USAGE_LOG.md
 * Author review: Changes validated and confirmed.
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-11-10
 * Scope: Implementation, refactoring, and test assistance for the recorded frontend work.
 */
import { useEffect, useId, useRef, useState } from 'react'
import { getProfileName } from '../../features/auth/profile.api'
import { useAuth } from '../../features/auth/useAuth'

function getInitials(name: string) {
  const words = name.split(/\s+/)
  const first = Array.from(words[0])[0]
  const last = words.length > 1 ? Array.from(words[words.length - 1])[0] : ''
  return (first + last).toLocaleUpperCase()
}

export function AccountMenu() {
  const { status, currentUserId, signOut } = useAuth()
  const [profile, setProfile] = useState<{ userId: string; name: string | null } | null>(null)
  const [open, setOpen] = useState(false)
  const [isSigningOut, setIsSigningOut] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const panelId = useId()
  const name = status === 'authenticated' && profile?.userId === currentUserId ? profile.name : null

  useEffect(() => {
    if (status !== 'authenticated' || !currentUserId) return
    const controller = new AbortController()
    void getProfileName(controller.signal).catch(() => null).then((name) => {
      if (!controller.signal.aborted) setProfile({ userId: currentUserId, name })
    })
    return () => controller.abort()
  }, [status, currentUserId])

  useEffect(() => {
    if (!open) return
    function closeOutside(event: PointerEvent) {
      if (event.target instanceof Node && !root.current?.contains(event.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', closeOutside)
    return () => document.removeEventListener('pointerdown', closeOutside)
  }, [open])

  async function handleSignOut() {
    setIsSigningOut(true)
    try {
      await signOut()
      setOpen(false)
    } finally {
      setIsSigningOut(false)
    }
  }

  return (
    <div
      ref={root}
      className="relative shrink-0"
      onKeyDown={(event) => {
        if (open && event.key === 'Escape') {
          setOpen(false)
          trigger.current?.focus()
        }
      }}
    >
      <button
        ref={trigger}
        type="button"
        aria-label={name ? `Account menu for ${name}` : 'Account menu'}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        title={name ?? 'Account menu'}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        className="grid size-9 cursor-pointer place-items-center rounded-full bg-[#e1f1e8] text-xs font-semibold text-[#175c45] hover:bg-[#d4e9de] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#175c45] lg:size-10 lg:text-sm"
      >
        {name ? <span aria-hidden="true">{getInitials(name)}</span> : (
          <svg aria-hidden="true" className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
            <circle cx="12" cy="8" r="3" />
            <path d="M5 20v-2a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v2" />
          </svg>
        )}
      </button>
      {open ? (
        <div id={panelId} className="absolute right-0 top-[calc(100%+0.75rem)] z-50 w-36 rounded-xl border border-[#dde3de] bg-white p-1.5 shadow-lg">
          <button
            type="button"
            disabled={isSigningOut}
            onClick={() => void handleSignOut()}
            className="w-full cursor-pointer rounded-lg px-3 py-2 text-left text-sm font-semibold text-[#175c45] hover:bg-[#f0f6f2] focus-visible:outline-2 focus-visible:outline-[#175c45] disabled:cursor-wait disabled:opacity-60"
          >
            {isSigningOut ? 'Signing out…' : 'Log out'}
          </button>
        </div>
      ) : null}
    </div>
  )
}
