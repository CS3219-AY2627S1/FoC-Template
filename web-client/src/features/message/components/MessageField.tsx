import { formatTime } from '@/lib/format'

type MessageFieldProps = {
  position: 'left' | 'right'
  content: string
  timestamp: string
}

export function MessageField({ position, content, timestamp }: MessageFieldProps) {
  const isRight = position === 'right'

  return (
    <div className={isRight ? 'flex justify-end' : 'flex justify-start'}>
      <div
        className={
          isRight
            ? 'grid min-w-0 grid-cols-1 gap-1 rounded-card bg-accent p-4 text-on-accent'
            : 'ds-surface grid min-w-0 grid-cols-1 gap-1 p-4'
        }
      >
        <p className="wrap-anywhere">{content}</p>
        <p className="text-sm">{formatTime(timestamp)}</p>
      </div>
    </div>
  )
}
