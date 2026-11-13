import type { ReactNode } from 'react'
import styles from './Panel.module.scss'

type PanelProps = {
  title: string
  action?: ReactNode
  children: ReactNode
}

export const Panel = ({ title, action, children }: PanelProps) => (
  <section className={styles.panel}>
    <header className={styles.header}>
      <h2 className={styles.title}>{title}</h2>
      {action}
    </header>
    <div className={styles.body}>{children}</div>
  </section>
)
