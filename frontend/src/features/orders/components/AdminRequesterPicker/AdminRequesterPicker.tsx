import { useEffect, useState } from 'react'
import { useUsersQuery } from '#/features/users/hooks/useUsersQuery'
import { useUserQuery } from '#/features/users/hooks/useUserQuery'
import { OrderFeedback } from '../OrderFeedback/OrderFeedback'
import { Button } from '@base-ui/react/button'
import styles from '../../styles/order.module.scss'
import picker from './AdminRequesterPicker.module.scss'

export const AdminRequesterPicker = ({
  requesterId,
  onSelect,
}: {
  requesterId: string
  onSelect: (id: string) => void
}) => {
  const [input, setInput] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(input)
      setPage(0)
    }, 300)
    return () => clearTimeout(timer)
  }, [input])
  const users = useUsersQuery({ search, page, size: 10, sort: 'name,asc' })
  const selected = useUserQuery(requesterId)
  return (
    <section className={styles.panel} aria-label="Choose Requester">
      <h2 className={styles.sectionTitle}>Choose a Requester</h2>
      {requesterId && (
        <p>
          Selected: {selected.data?.name ?? requesterId}
          {selected.data && ` · ${selected.data.email}`}
        </p>
      )}
      <label className={styles.search}>
        Search by name or email
        <input
          className={styles.input}
          type="search"
          value={input}
          onChange={(event) => setInput(event.target.value)}
        />
      </label>
      <OrderFeedback
        error={users.error}
        loading={users.isPending}
        retry={() => void users.refetch()}
      />
      <ul className={picker.requesters}>
        {users.data?.items.map((user) => (
          <li key={user.id}>
            <Button
              className={`${styles.secondary} ${picker.requesterButton}`}
              disabled={users.isPlaceholderData}
              aria-pressed={user.id === requesterId}
              onClick={() => onSelect(user.id)}
            >
              {user.name} · {user.email}
            </Button>
          </li>
        ))}
      </ul>
      {users.data && !users.data.total && <p>No users match your search.</p>}
      {users.data && users.data.total > 10 && (
        <div className={styles.pagination}>
          <Button
            className={styles.secondary}
            disabled={page === 0 || users.isFetching}
            onClick={() => setPage(page - 1)}
          >
            Previous users
          </Button>
          <span>Page {page + 1}</span>
          <Button
            className={styles.secondary}
            disabled={(page + 1) * 10 >= users.data.total || users.isFetching}
            onClick={() => setPage(page + 1)}
          >
            Next users
          </Button>
        </div>
      )}
    </section>
  )
}
