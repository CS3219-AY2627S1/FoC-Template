import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { getAccountInitials } from './AccountMenu.logic'
import styles from './UserHeader.module.scss'

export const AccountSummary = ({
  name,
  avatarUrl,
  balance,
}: {
  name: string
  avatarUrl?: string | null
  balance: string
}) => {
  const [failedAvatar, setFailedAvatar] = useState<string | null>(null)

  return (
    <>
      <span className={styles.avatar} aria-hidden="true">
        {avatarUrl && avatarUrl !== failedAvatar ? (
          <img
            src={avatarUrl}
            alt=""
            onError={() => setFailedAvatar(avatarUrl)}
          />
        ) : (
          getAccountInitials(name)
        )}
      </span>
      <span className={styles.identity}>
        <span className={styles.name}>{name}</span>
        <span className={styles.balance}>{balance}</span>
      </span>
      <ChevronDown
        className={styles.chevron}
        size={12}
        strokeWidth={2}
        aria-hidden="true"
      />
    </>
  )
}
