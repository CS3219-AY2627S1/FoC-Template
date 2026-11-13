import { LogOut } from 'lucide-react'
import { useLogout } from '@/api/user/session'
import { FormError } from '@/components/FormError'

type LogoutButtonProps = {
  // 'nav' looks like a sidebar entry, 'button' like a normal secondary button.
  look: 'nav' | 'button'
}

const lookClasses: Record<LogoutButtonProps['look'], string> = {
  nav: 'ds-nav-item w-full',
  button: 'ds-btn ds-btn--glass justify-self-start',
}

export function LogoutButton({ look }: LogoutButtonProps) {
  const logout = useLogout()

  return (
    <div className="grid grid-cols-1 gap-2">
      <button
        type="button"
        className={lookClasses[look]}
        disabled={logout.isPending}
        aria-busy={logout.isPending || undefined}
        onClick={() => logout.mutate()}
      >
        <LogOut aria-hidden="true" className="size-5 shrink-0" />
        {logout.isPending ? 'Logging out…' : 'Log out'}
      </button>
      <FormError error={logout.error} />
    </div>
  )
}
