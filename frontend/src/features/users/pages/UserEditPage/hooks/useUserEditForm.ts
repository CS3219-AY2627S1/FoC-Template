import { useEffect, useMemo, useRef } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useBlocker } from '@tanstack/react-router'
import { useForm } from 'react-hook-form'
import { createUserSchema } from '../../../schemas/user.schema'
import type { UserFormValues } from '../../../schemas/user.schema'
import type { User } from '../../../types/user.types'
import { getUserFormValues } from '../UserEditPage.logic'

export const useUserEditForm = (user: User, faculties: string[]) => {
  const schema = useMemo(() => createUserSchema(faculties), [faculties])
  const form = useForm<UserFormValues>({
    defaultValues: getUserFormValues(user),
    resolver: zodResolver(schema),
  })
  const { isDirty, isSubmitting } = form.formState
  const { reset } = form
  const syncedUser = useRef(user)

  useEffect(() => {
    if (syncedUser.current === user || isDirty) return
    reset(getUserFormValues(user))
    syncedUser.current = user
  }, [user, isDirty, reset])

  const blocker = useBlocker({
    shouldBlockFn: () => isDirty && !isSubmitting,
    enableBeforeUnload: () => isDirty && !isSubmitting,
    withResolver: true,
  })

  const handleDiscardDialogOpenChange = (open: boolean) => {
    if (!open && blocker.status === 'blocked') blocker.reset()
  }
  const confirmDiscardChanges = () => {
    if (blocker.status === 'blocked') blocker.proceed()
  }

  return {
    ...form,
    isNavigationBlocked: blocker.status === 'blocked',
    handleDiscardDialogOpenChange,
    confirmDiscardChanges,
  }
}
