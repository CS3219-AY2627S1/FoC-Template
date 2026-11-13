import { Checkbox } from '@base-ui/react/checkbox'
import { Controller } from 'react-hook-form'
import type { Control } from 'react-hook-form'
import type { UserFormValues } from '../../../../schemas/user.schema'
import type { UserRole } from '../../../../types/user.types'
import { toggleUserRole } from '../../UserEditPage.logic'
import styles from './UserRolesField.module.scss'

const roleOptions: { value: UserRole; label: string }[] = [
  { value: 'USER', label: 'User' },
  { value: 'ADMIN', label: 'Admin' },
]

type UserRolesFieldProps = {
  control: Control<UserFormValues>
  errorMessage?: string
}

export const UserRolesField = ({
  control,
  errorMessage,
}: UserRolesFieldProps) => (
  <fieldset
    className={styles.roles}
    aria-describedby={errorMessage ? 'user-roles-error' : undefined}
  >
    <legend>Roles</legend>
    <Controller
      name="roles"
      control={control}
      render={({ field }) => (
        <div className={styles.roleOptions}>
          {roleOptions.map(({ value, label }) => (
            <label key={value} className={styles.roleOption}>
              <Checkbox.Root
                className={styles.checkbox}
                checked={field.value.includes(value)}
                onCheckedChange={(checked) =>
                  field.onChange(toggleUserRole(field.value, value, checked))
                }
                onBlur={field.onBlur}
              >
                <Checkbox.Indicator
                  className={styles.checkmark}
                  aria-hidden="true"
                >
                  ✓
                </Checkbox.Indicator>
              </Checkbox.Root>
              {label}
            </label>
          ))}
        </div>
      )}
    />
    {errorMessage && (
      <p id="user-roles-error" className={styles.fieldError} role="alert">
        {errorMessage}
      </p>
    )}
  </fieldset>
)
