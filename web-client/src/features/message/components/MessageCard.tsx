import { Link } from 'react-router'
import { SYSTEM_SENDER_ID } from '@/api/message/message'
import type { Conversation } from '@/api/message/types'
import { useName } from '@/api/user/member'
import { formatDateTime } from '@/lib/format'

type MessageCardProps = {
  conversation: Conversation
}

export function MessageCard({ conversation }: MessageCardProps) {
  const { otherId, orderId, lastMessage, unread } = conversation
  const isSystem = otherId === SYSTEM_SENDER_ID
  // Relay is not an account, so there is no name to look up.
  const name = useName(otherId, !isSystem)
  const title = isSystem ? 'Relay' : (name.data ?? 'Unknown user')

  return (
    <li>
      {/* An errand's chat lives on its errand page. Only Relay's messages have their own page. */}
      <Link
        to={orderId ? `/errands/${orderId}#chat` : `/message/${otherId}`}
        className="flex items-start justify-between gap-3 p-4"
      >
        <div className="grid min-w-0 grid-cols-1 gap-1">
          <p className="font-semibold wrap-anywhere">{title}</p>
          {orderId && <p className="text-sm text-subtle">Errand #{orderId}</p>}
          <p className="text-muted wrap-anywhere">{lastMessage.content}</p>
          <p className="text-sm text-subtle">{formatDateTime(lastMessage.createdAt)}</p>
        </div>
        {unread > 0 && <span className="ds-badge ds-badge--info">{unread} unread</span>}
      </Link>
    </li>
  )
}
