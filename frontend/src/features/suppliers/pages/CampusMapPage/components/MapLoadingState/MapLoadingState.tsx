import { LoaderCircle } from 'lucide-react'
import styles from './MapLoadingState.module.scss'

export const MapLoadingState = () => (
  <div className={styles.placeholder} role="status">
    <span className={styles.indicator}>
      <LoaderCircle className={styles.spinner} size={32} aria-hidden="true" />
    </span>
    <span className={styles.srOnly}>Loading map…</span>
  </div>
)
