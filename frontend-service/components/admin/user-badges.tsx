import { STATUS_LABELS } from '@/lib/admin-users';
import type { UserRole, UserStatus } from '@/lib/user-service';
import { cn } from '@/lib/utils';

const STATUS_STYLES: Record<UserStatus, string> = {
  active: 'bg-emerald-50 text-emerald-700',
  suspended: 'bg-red-50 text-red-600',
  deactivated: 'bg-slate-100 text-slate-500',
};

const BADGE =
  'inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-semibold';

export function UserBadges({
  role,
  status,
}: {
  role: UserRole;
  status: UserStatus;
}) {
  return (
    <span className='flex flex-wrap items-center gap-1.5'>
      <span className={cn(BADGE, STATUS_STYLES[status])}>
        {STATUS_LABELS[status]}
      </span>
      {role === 'admin' && (
        <span className={cn(BADGE, 'bg-courier-soft text-courier')}>Admin</span>
      )}
    </span>
  );
}
