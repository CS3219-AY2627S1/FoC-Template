import { useEffect, useRef, useState } from 'react'
import { Tooltip } from '@base-ui/react/tooltip'
import styles from './UserTable.module.scss'

type OverflowTextProps = {
  value: string
}

export const OverflowText = ({ value }: OverflowTextProps) => {
  const triggerRef = useRef<HTMLSpanElement>(null)
  const [isOverflowing, setIsOverflowing] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const trigger = triggerRef.current
    if (!trigger) return

    const measure = () => {
      const nextIsOverflowing = trigger.scrollWidth > trigger.clientWidth
      setIsOverflowing(nextIsOverflowing)
      if (!nextIsOverflowing) setOpen(false)
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(trigger)
    return () => observer.disconnect()
  }, [value])

  const show = () => {
    if (isOverflowing) setOpen(true)
  }

  return (
    <Tooltip.Root disabled={!isOverflowing} open={open} onOpenChange={setOpen}>
      <Tooltip.Trigger
        closeOnClick={false}
        delay={250}
        render={
          <span
            ref={triggerRef}
            className={styles.overflowText}
            role={isOverflowing ? 'button' : undefined}
            tabIndex={isOverflowing ? 0 : undefined}
            data-overflowing={isOverflowing || undefined}
            onClick={show}
            onKeyDown={(event) => {
              if (!isOverflowing) return
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                show()
              }
            }}
          />
        }
      >
        {value}
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Positioner sideOffset={6} className={styles.tooltipPositioner}>
          <Tooltip.Popup role="tooltip" className={styles.tooltip}>
            {value}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  )
}
