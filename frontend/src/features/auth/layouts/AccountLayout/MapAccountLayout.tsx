import { Outlet } from '@tanstack/react-router'
import { UserHeader } from './UserHeader'
import styles from './MapAccountLayout.module.scss'

export const MapAccountLayout = () => (
  <div className={styles.layout}>
    <UserHeader floating />
    <main className={styles.content}>
      <Outlet />
    </main>
  </div>
)
