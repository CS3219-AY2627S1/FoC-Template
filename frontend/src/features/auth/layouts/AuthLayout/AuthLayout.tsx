import { Outlet } from '@tanstack/react-router'
import styles from './AuthLayout.module.scss'

export const AuthLayout = () => {
  return (
    <main className={styles.layout}>
      <div className={styles.card}>
        <p className={styles.brand}>FoC</p>
        <Outlet />
      </div>
    </main>
  )
}
