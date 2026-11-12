import creditIcon from '../../assets/errand-credit.svg'
import routeMarkers from '../../assets/errand-route.svg'
import courierRoleIcon from '../../assets/courier-role.svg'
import requesterRoleIcon from '../../assets/requester-role.svg'
import type {
  MyErrandItem,
  MyErrandProgress,
  MyErrandRole,
} from '../../features/errands/my-errands.types'

type MyErrandCardProps = {
  errand: MyErrandItem
}

const progressLabels: Record<MyErrandProgress, string> = {
  'waiting-for-courier': 'Waiting for courier',
  accepted: 'Accepted',
  'ready-for-collection': 'Ready for pickup',
  'awaiting-confirmation': 'Awaiting confirmation',
}

const progressStyles: Record<MyErrandProgress, string> = {
  'waiting-for-courier': 'bg-[#fff3d8] text-[#8e6523]',
  accepted: 'bg-[#ddf3e7] text-[#1e694e]',
  'ready-for-collection': 'bg-[#ddf3e7] text-[#1e694e]',
  'awaiting-confirmation': 'bg-[#ddf3e7] text-[#1e694e]',
}

const roleLabels: Record<MyErrandRole, string> = {
  requester: 'Requester',
  courier: 'Courier',
}

function formatExpiry(expiresAt: string) {
  return new Intl.DateTimeFormat('en-SG', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(expiresAt))
}

export function MyErrandCard({ errand }: MyErrandCardProps) {
  const roleStyle =
    errand.role === 'requester' ? 'text-[#1677d2]' : 'text-[#ac7f5e]'
  const roleIcon = errand.role === 'requester' ? requesterRoleIcon : courierRoleIcon

  return (
    <article className="flex min-h-[238px] flex-col rounded-[18px] border border-[#dde3de] bg-white p-5 shadow-[0_8px_24px_rgba(22,59,42,0.07)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <span
          className={`rounded-full px-2.5 py-1 text-xs ${progressStyles[errand.progress]}`}
        >
          {progressLabels[errand.progress]}
        </span>
        <span className={`flex items-center gap-1.5 text-xs ${roleStyle}`}>
          <img src={roleIcon} alt="" width="16" height="16" />
          {roleLabels[errand.role]}
        </span>
      </div>

      <h2 className="mt-4 text-lg font-medium leading-tight tracking-[-0.015em] text-[#17211d]">
        {errand.requiredItem}
      </h2>

      <div className="mt-4 flex gap-3 text-sm leading-6 text-[#28332d]">
        <img
          src={routeMarkers}
          alt=""
          width="16"
          height="24"
          className="mt-0.5 shrink-0"
        />
        <div className="min-w-0">
          <p className="truncate">{errand.pickupLocation}</p>
          <p className="truncate">{errand.deliveryLocation}</p>
        </div>
      </div>

      <div className="mt-auto flex items-end justify-between gap-4 pt-5">
        <div>
          <p className="text-[10px] font-medium tracking-[0.08em] text-[#68736c]">
            ACTIVE UNTIL
          </p>
          <p className="mt-1 text-xs text-[#68736c]">{formatExpiry(errand.expiresAt)}</p>
        </div>
        <p className="flex shrink-0 items-center gap-1.5 rounded-full bg-[#ddf3e7] px-2.5 py-1.5 text-sm text-[#175c45]">
          <img src={creditIcon} alt="" width="14" height="14" />
          {errand.creditValue} credits
        </p>
      </div>
      <Link
        to={`/errands/${errand.id}`}
        className="mt-4 inline-flex w-fit items-center text-sm font-semibold text-[#175c45] underline decoration-[#175c45]/30 underline-offset-4 transition hover:decoration-[#175c45] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#175c45]"
      >
        View details →
      </Link>
    </article>
  )
}
import { Link } from 'react-router'
