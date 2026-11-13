import { Outlet } from '@tanstack/react-router'
import { UserHeader } from './UserHeader'
import styles from './AccountLayout.module.scss'

export const AccountLayout = () => (
  <div className={styles.layout}>
    <UserHeader />
    <main className={styles.content}>
      <Outlet />
    </main>
  </div>
)
