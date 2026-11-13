import { ArrowLeft, MapPinOff } from 'lucide-react'
import { Link } from 'react-router-dom'
import styles from './ScaffoldPage.module.css'

export function NotFoundPage() {
  return (
    <section className={styles.page}>
      <span className={styles.icon} aria-hidden="true">
        <MapPinOff />
      </span>
      <p className={styles.eyebrow}>404 · Location unavailable</p>
      <h1>Page not found</h1>
      <p className={styles.intro}>
        This Supplier page does not exist or may have moved.
      </p>
      <Link className={styles.action} to="/suppliers">
        <ArrowLeft aria-hidden="true" />
        Return to suppliers
      </Link>
    </section>
  )
}
