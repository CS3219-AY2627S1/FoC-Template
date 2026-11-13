import type { ReactNode } from 'react'

type Tone = 'info' | 'success' | 'danger'

type NoticeProps = {
  tone: Tone
  title?: string
  children?: ReactNode
  // 'alert' makes screen readers announce it at once; use it for errors that just appeared.
  role?: 'alert' | 'status'
}

const toneClasses: Record<Tone, { box: string; title: string }> = {
  info: { box: 'ds-notice ds-notice--info', title: 'font-semibold text-info' },
  success: { box: 'ds-notice ds-notice--success', title: 'font-semibold text-success' },
  danger: { box: 'ds-notice ds-notice--danger', title: 'font-semibold text-danger' },
}

export function Notice({ tone, title, children, role }: NoticeProps) {
  const classes = toneClasses[tone]
  return (
    <div role={role} className={classes.box}>
      {title && <p className={classes.title}>{title}</p>}
      {children && <div className="text-muted">{children}</div>}
    </div>
  )
}