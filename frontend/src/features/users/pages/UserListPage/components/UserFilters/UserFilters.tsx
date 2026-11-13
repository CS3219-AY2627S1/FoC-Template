import { Button } from '@base-ui/react/button'
import { Input } from '@base-ui/react/input'
import { Toggle } from '@base-ui/react/toggle'
import { ToggleGroup } from '@base-ui/react/toggle-group'
import { UNASSIGNED_FACULTY } from '#/constants/faculty'
import type { UserRole } from '../../../../types/user.types'
import styles from './UserFilters.module.scss'

const roleOptions = [
  { value: 'ALL', label: 'All' },
  { value: 'USER', label: 'User' },
  { value: 'ADMIN', label: 'Admin' },
] as const

type UserFiltersProps = {
  searchInput: string
  role: UserRole | ''
  faculty: string
  faculties: string[]
  facultyError: boolean
  onSearchChange: (value: string) => void
  onRoleChange: (role: UserRole | '') => void
  onFacultyChange: (faculty: string) => void
  onRetryFaculties: () => void
}

export const UserFilters = ({
  searchInput,
  role,
  faculty,
  faculties,
  facultyError,
  onSearchChange,
  onRoleChange,
  onFacultyChange,
  onRetryFaculties,
}: UserFiltersProps) => {
  const handleRoleChange = (values: string[]) => {
    const nextRole = values[0]
    if (!nextRole) return
    onRoleChange(nextRole === 'ALL' ? '' : (nextRole as UserRole))
  }

  return (
    <div className={styles.toolbar}>
      <Input
        type="search"
        aria-label="Search users by name or email"
        placeholder="Search name or email"
        className={styles.search}
        value={searchInput}
        onValueChange={onSearchChange}
      />
      <div className={styles.filterGroup}>
        <span className={styles.filterLabel}>Role</span>
        <ToggleGroup
          aria-label="Role"
          className={styles.roleFilters}
          value={[role || 'ALL']}
          onValueChange={handleRoleChange}
        >
          {roleOptions.map((option) => (
            <Toggle
              key={option.value}
              value={option.value}
              className={styles.roleChip}
            >
              {option.label}
            </Toggle>
          ))}
        </ToggleGroup>
      </div>
      <label className={`${styles.filterGroup} ${styles.facultyFilter}`}>
        <span className={styles.filterLabel}>Faculty</span>
        <span className={styles.selectWrapper}>
          <select
            className={styles.select}
            value={faculty}
            onChange={(event) => onFacultyChange(event.target.value)}
            disabled={facultyError || faculties.length === 0}
          >
            <option value="">All faculties</option>
            <option value={UNASSIGNED_FACULTY}>No faculty</option>
            {faculties.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </span>
      </label>
      {facultyError && (
        <Button
          type="button"
          className={styles.retryButton}
          onClick={onRetryFaculties}
        >
          Retry faculty choices
        </Button>
      )}
    </div>
  )
}
