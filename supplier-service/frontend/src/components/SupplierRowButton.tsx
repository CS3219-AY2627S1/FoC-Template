// AI Assistance Disclosure:
// Tool: ChatGPT (model: GPT-5.6 Luna), date: 2026-09-22
// Scope: Generated initial implementation, decomposed App.tsx into separate components
// Author review: I validated correctness and edited for style.

import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { RelayButton, type RelayButtonSize, type RelayButtonVariant } from '@relay/ui'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode
  variant?: Extract<RelayButtonVariant, 'primary' | 'secondary'>
  size?: RelayButtonSize
}

export function SupplierRowButton({
  children,
  className = '',
  variant = 'secondary',
  size = 'default',
  ...props
}: Props) {
  const styleClass = variant === 'primary' ? 'glass-btn-primary' : 'glass-btn'
  return (
    <RelayButton
      {...props}
      variant={variant}
      size={size}
      scale={1}
      className={`supplier-row-button ${styleClass}${className ? ` ${className}` : ''}`}
    >
      {children}
    </RelayButton>
  )
}
