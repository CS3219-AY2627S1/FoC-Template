import { Link, useParams, useSearch } from '@tanstack/react-router'
import { UserAvatar } from '../../components/UserAvatar/UserAvatar'
import { useUserQuery } from '../../hooks/useUserQuery'
import { formatUserDate } from '../../utils/formatUserDate'
import { getUserErrorMessage } from '../../utils/userErrors'
import { UserEditSkeleton } from '../UserEditPage/components/UserEditSkeleton/UserEditSkeleton'
import styles from './UserViewPage.module.scss'

export const UserViewPage = () => {
  const { userId } = useParams({ from: '/admin/users/$userId' })
  const listSearch = useSearch({ from: '/admin/users/$userId' })
  const { data: user, error } = useUserQuery(userId)

  return (
    <section className={styles.page}>
      <Link to="/admin/users" search={listSearch} className={styles.backLink}>
        ← Users
      </Link>
      <header className={styles.header}>
        <div>
          <p>User details</p>
          <h1>{user?.name ?? 'User'}</h1>
        </div>
        {user && (
          <div className={styles.headerActions}>
            <Link
              to="/admin/orders"
              search={{ requesterId: userId, page: 0 }}
              className={styles.ordersLink}
            >
              View requested orders
            </Link>
            <Link
              to="/admin/users/$userId/edit"
              params={{ userId }}
              search={listSearch}
              className={styles.editLink}
            >
              Edit user
            </Link>
          </div>
        )}
      </header>

      {!user && !error && <UserEditSkeleton />}
      {error && (
        <p className={styles.error} role="alert">
          {getUserErrorMessage(error)}
        </p>
      )}
      {user && (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <tbody>
              <tr>
                <th scope="row">Name</th>
                <td>
                  <span className={styles.name}>
                    <UserAvatar user={user} />
                    {user.name}
                  </span>
                </td>
              </tr>
              <tr>
                <th scope="row">Email</th>
                <td>{user.email}</td>
              </tr>
              <tr>
                <th scope="row">Phone number</th>
                <td>{user.phoneNumber || '-'}</td>
              </tr>
              <tr>
                <th scope="row">Faculty</th>
                <td>{user.faculty || '-'}</td>
              </tr>
              <tr>
                <th scope="row">Roles</th>
                <td>{user.roles.join(', ')}</td>
              </tr>
              <tr>
                <th scope="row">Created</th>
                <td>{formatUserDate(user.createdAt)}</td>
              </tr>
              <tr>
                <th scope="row">Last updated</th>
                <td>{formatUserDate(user.updatedAt)}</td>
              </tr>
              <tr>
                <th scope="row">User ID</th>
                <td>{user.id}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
