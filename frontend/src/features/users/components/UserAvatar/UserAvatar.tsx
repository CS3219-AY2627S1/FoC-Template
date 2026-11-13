import { useState } from 'react'
import type { User } from '../../types/user.types'
import styles from './UserAvatar.module.scss'

type UserAvatarProps = {
  user: Pick<User, 'name' | 'avatarUrl'>
  large?: boolean
}

export const UserAvatar = ({ user, large = false }: UserAvatarProps) => {
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const initials =
    user.name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase() || '?'

  return (
    <span
      className={`${styles.avatar} ${large ? styles.large : ''}`}
      aria-hidden="true"
    >
      {user.avatarUrl && user.avatarUrl !== failedUrl ? (
        <img
          src={user.avatarUrl}
          alt=""
          onError={() => setFailedUrl(user.avatarUrl)}
        />
      ) : (
        initials
      )}
    </span>
  )
}
