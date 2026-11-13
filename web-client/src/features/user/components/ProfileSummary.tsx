import type { PublicUser } from '@/api/user/types'
import { formatDate } from '@/lib/format'

type ProfileSummaryProps = {
  user: PublicUser
}

// "Felix Haag" becomes "FH", a single name its first letter. Array.from keeps an emoji in one piece.
function initialsOf(fullName: string): string {
  const words = fullName.trim().split(/\s+/)
  const first = Array.from(words[0] ?? '')[0] ?? ''
  const last = words.length > 1 ? (Array.from(words[words.length - 1] ?? '')[0] ?? '') : ''
  return (first + last).toUpperCase()
}

export function ProfileSummary({ user }: ProfileSummaryProps) {
  return (
    <section aria-labelledby="profile-name" className="ds-surface grid grid-cols-1 gap-5 p-5">
      <div className="flex items-center gap-4">
        <span
          aria-hidden="true"
          className="flex size-16 shrink-0 items-center justify-center rounded-chip bg-accent-gradient text-xl font-semibold text-on-accent"
        >
          {initialsOf(user.fullName)}
        </span>
        <div className="grid min-w-0 grid-cols-1 gap-1">
          <h2 id="profile-name" className="wrap-anywhere">
            {user.fullName}
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <p className="min-w-0 text-muted wrap-anywhere">@{user.username}</p>
            {user.roles.includes('administrator') && <span className="ds-badge ds-badge--info">Administrator</span>}
          </div>
        </div>
      </div>
      {/* Shown, not editable: the user-service refuses changes to these (F1.4.3). */}
      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="min-w-0">
          <dt className="ds-label">NUS email</dt>
          <dd className="mt-1 wrap-anywhere">{user.email}</dd>
        </div>
        <div className="min-w-0">
          <dt className="ds-label">Joined</dt>
          <dd className="mt-1">{formatDate(user.createdAt)}</dd>
        </div>
      </dl>
    </section>
  )
}
