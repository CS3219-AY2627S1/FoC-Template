import { Button } from '@base-ui/react/button'
import styles from './UserListNoData.module.scss'

type UserListNoDataProps = {
  errorMessage?: string
  hasFilters: boolean
  onClearFilters: () => void
  onRetry: () => void
}

export const UserListNoData = ({
  errorMessage,
  hasFilters,
  onClearFilters,
  onRetry,
}: UserListNoDataProps) => (
  <div className={styles.noData}>
    {errorMessage ? (
      <>
        <p role="alert">{errorMessage}</p>
        <Button className={styles.button} onClick={onRetry}>
          Retry
        </Button>
      </>
    ) : hasFilters ? (
      <>
        <p>No users match these filters.</p>
        <Button className={styles.button} onClick={onClearFilters}>
          Clear filters
        </Button>
      </>
    ) : (
      <p>No users yet.</p>
    )}
  </div>
)
