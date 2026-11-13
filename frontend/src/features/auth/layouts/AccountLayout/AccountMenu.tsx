import { Menu } from '@base-ui/react/menu'
import { useNavigate } from '@tanstack/react-router'
import { useCreditBalance } from '#/features/credits/hooks/useCreditBalance'
import { useSession } from '../../hooks/useSession'
import { useUserProfile } from '../../hooks/useUserProfile'
import { useAuth } from '../../providers/AuthProvider'
import { AccountSummary } from './AccountSummary'
import { getBalanceLabel } from './AccountMenu.logic'
import styles from './UserHeader.module.scss'

export const AccountMenu = () => {
  const navigate = useNavigate()
  const auth = useAuth()
  const session = useSession()
  const profile = useUserProfile()
  const balance = useCreditBalance(session.userId)
  const name = profile.data?.name ?? 'Your account'
  const balanceLabel = getBalanceLabel(balance)

  return (
    <Menu.Root>
      <Menu.Trigger
        className={styles.account}
        aria-label={`Open account for ${name}`}
      >
        <AccountSummary
          name={name}
          avatarUrl={profile.data?.avatarUrl}
          balance={balanceLabel}
        />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner
          align="end"
          sideOffset={12}
          className={styles.menuPositioner}
        >
          <Menu.Popup className={styles.menu}>
            <p className={styles.menuBalance}>{balanceLabel}</p>
            <Menu.Item
              className={styles.menuItem}
              onClick={() => void navigate({ to: '/profile' })}
            >
              Profile
            </Menu.Item>
            {session.roles.includes('ADMIN') ? (
              <Menu.Item
                className={styles.menuItem}
                onClick={() => void navigate({ to: '/admin' })}
              >
                Admin
              </Menu.Item>
            ) : null}
            <Menu.Item
              className={styles.logout}
              onClick={() =>
                void auth
                  .logout()
                  .then(() => navigate({ to: '/login', replace: true }))
              }
            >
              Log out
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  )
}
