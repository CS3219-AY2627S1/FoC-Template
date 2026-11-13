import { Link, linkOptions } from '@tanstack/react-router'
import { ClipboardList, House, Map as MapIcon } from 'lucide-react'
import styles from './UserHeader.module.scss'

const navigation = linkOptions([
  {
    to: '/home',
    label: 'Home',
    icon: House,
    activeOptions: { exact: false, includeSearch: false },
  },
  { to: '/map', label: 'Map', icon: MapIcon },
  {
    to: '/errands',
    label: 'My Errands',
    icon: ClipboardList,
    search: { tab: 'active', participation: 'all', page: 0 },
  },
])

export const MainNavigation = ({
  icons = false,
  onNavigate,
}: {
  icons?: boolean
  onNavigate?: () => void
}) => (
  <>
    {navigation.map(({ label, icon: Icon, ...options }) => (
      <Link key={options.to} {...options} onClick={onNavigate}>
        {icons ? (
          <Icon
            className={styles.navIcon}
            size={20}
            strokeWidth={1.8}
            aria-hidden="true"
          />
        ) : null}
        {label}
      </Link>
    ))}
  </>
)
