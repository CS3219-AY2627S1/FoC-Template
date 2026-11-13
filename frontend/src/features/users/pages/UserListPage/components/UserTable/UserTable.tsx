import { useMemo } from 'react'
import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import DataTable from 'react-data-table-component'
import type { TableColumn } from 'react-data-table-component'
import type { User, UserListParams } from '../../../../types/user.types'
import { UserAvatar } from '../../../../components/UserAvatar/UserAvatar'
import { formatUserDate } from '../../../../utils/formatUserDate'
import type { UserListSearch } from '../../utils/userListSearch'
import { OverflowText } from './OverflowText'
import styles from './UserTable.module.scss'

const EMPTY_USERS: User[] = []
const PAGINATION_OPTIONS = { noRowsPerPage: true }

type UserTableProps = {
  users?: User[]
  total: number
  page: number
  sort: UserListParams['sort']
  listSearch: UserListSearch
  isLoading: boolean
  isUpdating: boolean
  isRefreshing: boolean
  emptyContent: ReactNode
  onPageChange: (page: number) => void
  onSortChange: (sort: UserListParams['sort']) => void
}

export const UserTable = ({
  users,
  total,
  page,
  sort,
  listSearch,
  isLoading,
  isUpdating,
  isRefreshing,
  emptyContent,
  onPageChange,
  onSortChange,
}: UserTableProps) => {
  const { q, role, faculty, sort: listSort, page: listPage } = listSearch
  const columns = useMemo<TableColumn<User>[]>(
    () => [
      {
        id: 'name',
        name: 'Name',
        minWidth: '180px',
        selector: (user) => user.name,
        cell: (user) => (
          <span className={styles.userName}>
            <UserAvatar user={user} />
            <OverflowText value={user.name} />
          </span>
        ),
        sortable: true,
      },
      {
        id: 'email',
        name: 'Email',
        minWidth: '220px',
        selector: (user) => user.email,
        cell: (user) => <OverflowText value={user.email} />,
        sortable: true,
      },
      {
        id: 'phoneNumber',
        name: 'Phone',
        minWidth: '150px',
        selector: (user) => user.phoneNumber || '-',
        cell: (user) => <OverflowText value={user.phoneNumber || '-'} />,
      },
      {
        id: 'faculty',
        name: 'Faculty',
        minWidth: '160px',
        selector: (user) => user.faculty || '-',
        cell: (user) => <OverflowText value={user.faculty || '-'} />,
      },
      {
        id: 'roles',
        name: 'Roles',
        minWidth: '100px',
        selector: (user) => user.roles.join(', '),
        cell: (user) => <OverflowText value={user.roles.join(', ')} />,
      },
      {
        id: 'createdAt',
        name: 'Created at',
        minWidth: '205px',
        selector: (user) => user.createdAt,
        cell: (user) => <OverflowText value={formatUserDate(user.createdAt)} />,
        sortable: true,
      },
      {
        id: 'updatedAt',
        name: 'Updated at',
        minWidth: '205px',
        selector: (user) => user.updatedAt,
        cell: (user) => <OverflowText value={formatUserDate(user.updatedAt)} />,
        sortable: true,
      },
      {
        id: 'actions',
        name: 'Actions',
        minWidth: '160px',
        cell: (user) => (
          <span className={styles.actions}>
            <Link
              to="/admin/users/$userId"
              params={{ userId: user.id }}
              search={{ q, role, faculty, sort: listSort, page: listPage }}
              className={styles.actionLink}
            >
              View
            </Link>
            <Link
              to="/admin/users/$userId/edit"
              params={{ userId: user.id }}
              search={{ q, role, faculty, sort: listSort, page: listPage }}
              className={styles.actionLink}
            >
              Edit
            </Link>
          </span>
        ),
      },
    ],
    [q, role, faculty, listSort, listPage],
  )

  return (
    <div className={styles.tableShell}>
      {isUpdating && (
        <div
          className={styles.updatingOverlay}
          role="status"
          aria-label="Updating users"
        >
          <span className={styles.spinner} aria-hidden="true" />
        </div>
      )}
      {isRefreshing && (
        <span
          className={`${styles.spinner} ${styles.refreshIndicator}`}
          role="status"
          aria-label="Updating users"
        />
      )}
      <DataTable
        key={sort}
        ariaLabel="Users"
        columns={columns}
        data={users ?? EMPTY_USERS}
        keyField="id"
        defaultSortFieldId={sort.split(',')[0]}
        defaultSortAsc={sort.endsWith('asc')}
        sortServer
        onSort={(column, direction, _rows, sortColumns) => {
          const nextSort: UserListParams['sort'] = sortColumns.length
            ? `${column.id as 'name' | 'email' | 'createdAt' | 'updatedAt'},${direction}`
            : 'name,asc'
          if (nextSort !== sort) onSortChange(nextSort)
        }}
        pagination
        paginationServer
        paginationPage={page}
        paginationPerPage={20}
        paginationTotalRows={total}
        paginationComponentOptions={PAGINATION_OPTIONS}
        onChangePage={onPageChange}
        progressPending={isLoading}
        persistTableHead
        noDataComponent={emptyContent}
        disabled={isUpdating}
        responsive
      />
    </div>
  )
}
