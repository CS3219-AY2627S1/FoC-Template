import styles from './UserEditSkeleton.module.scss'

export const UserEditSkeleton = () => (
  <div className={styles.form} role="status" aria-label="Loading user">
    <div className={styles.content} aria-hidden="true">
      <div className={styles.field}>
        <span className={styles.label} />
        <span className={styles.input} />
      </div>
      <div className={styles.field}>
        <span className={styles.label} />
        <span className={styles.input} />
      </div>
      <div className={styles.field}>
        <span className={styles.label} />
        <div className={styles.roles}>
          <span className={styles.role} />
          <span className={styles.role} />
        </div>
      </div>
      <div className={styles.actions}>
        <span className={styles.button} />
        <span className={styles.button} />
      </div>
    </div>
  </div>
)
