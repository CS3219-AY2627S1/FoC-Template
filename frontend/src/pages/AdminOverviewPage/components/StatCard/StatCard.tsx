import type { ReactNode } from 'react'
import styles from './StatCard.module.scss'

type StatCardProps = {
  label: string
  value: ReactNode
  hint?: ReactNode
  tone?: 'default' | 'positive' | 'danger' | 'pending'
}

export const StatCard = ({
  label,
  value,
  hint,
  tone = 'default',
}: StatCardProps) => (
  <section className={styles.card} data-tone={tone}>
    <h2 className={styles.label}>{label}</h2>
    <p className={styles.value}>{value}</p>
    {hint && <div className={styles.hint}>{hint}</div>}
  </section>
)
