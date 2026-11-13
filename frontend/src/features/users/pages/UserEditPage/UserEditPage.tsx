import { Toast } from '@base-ui/react/toast'
import { Button } from '@base-ui/react/button'
import { Link, useNavigate, useParams, useSearch } from '@tanstack/react-router'
import { useFacultiesQuery } from '#/hooks/useFacultiesQuery'
import { useUpdateUserMutation } from '../../hooks/useUpdateUserMutation'
import { useUserQuery } from '../../hooks/useUserQuery'
import type { UserFormValues } from '../../schemas/user.schema'
import type { User } from '../../types/user.types'
import { getUserErrorMessage } from '../../utils/userErrors'
import { UserEditForm } from './components/UserEditForm/UserEditForm'
import { UserEditSkeleton } from './components/UserEditSkeleton/UserEditSkeleton'
import styles from './UserEditPage.module.scss'

export const UserEditPage = () => {
  const { userId } = useParams({ from: '/admin/users/$userId/edit' })
  const listSearch = useSearch({ from: '/admin/users/$userId/edit' })
  const navigate = useNavigate()
  const toast = Toast.useToastManager()
  const { data: user, error: userError } = useUserQuery(userId)
  const facultiesQuery = useFacultiesQuery()
  const {
    mutateAsync: updateUser,
    isPending: isUpdatingUser,
    error: updateError,
  } = useUpdateUserMutation()

  const userErrorMessage = userError
    ? getUserErrorMessage(userError)
    : undefined
  const updateErrorMessage = updateError
    ? getUserErrorMessage(updateError)
    : undefined
  const isInitialLoading =
    (!user || !facultiesQuery.data) && !userError && !facultiesQuery.isError
  const handleBackToList = () => {
    void navigate({ to: '/admin/users', search: listSearch })
  }
  const handleSubmitUser = async (values: UserFormValues) => {
    let updated: User
    try {
      updated = await updateUser({ id: userId, request: values })
    } catch {
      return
    }
    toast.add({
      type: 'success',
      title: `${updated.name} was updated.`,
      description:
        values.email !== updated.email
          ? `A verification email has been requested for ${values.email}. The current email remains unchanged until verification.`
          : undefined,
    })
    await navigate({ to: '/admin/users', search: listSearch, replace: true })
  }

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <Link to="/admin/users" search={listSearch} className={styles.backLink}>
          ← Users
        </Link>
        <h1>Edit user</h1>
      </header>
      {isInitialLoading && <UserEditSkeleton />}
      {userErrorMessage && (
        <p className={styles.error} role="alert">
          {userErrorMessage}
        </p>
      )}
      {facultiesQuery.isError && (
        <div className={styles.error} role="alert">
          Could not load faculty choices.{' '}
          <Button onClick={() => void facultiesQuery.refetch()}>Retry</Button>
        </div>
      )}
      {user && facultiesQuery.data && (
        <UserEditForm
          key={user.id}
          user={user}
          faculties={facultiesQuery.data}
          isSaving={isUpdatingUser}
          submitError={updateErrorMessage}
          onSubmit={handleSubmitUser}
          onCancel={handleBackToList}
        />
      )}
    </section>
  )
}
