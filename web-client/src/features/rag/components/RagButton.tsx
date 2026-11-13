import { BotMessageSquare, X } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'

type RagButtonProps = {
    // The chat shown in the overlay. Passed in by the shell, because a feature may not import another feature.
    children: ReactNode
}

// A floating assistant button in the bottom right corner that opens a small chat overlay above it.
// On phones both sit above the floating tab bar.
export function RagButton({ children }: RagButtonProps) {
    const [isOpen, setIsOpen] = useState(false)
    const panelId = useId()
    const buttonRef = useRef<HTMLButtonElement>(null)

    function close() {
        setIsOpen(false)
        buttonRef.current?.focus()
    }

    function onKeyDown(event: KeyboardEvent) {
        if (event.key === 'Escape') close()
    }

    return (
        <>
            {/* The frame spans from near the top of the screen down to just above the button and lets
                clicks through. The panel sits at its bottom and is never taller than the frame, so its
                header stays on screen on short phones and laptops alike. */}
            <div className="pointer-events-none fixed inset-x-4 top-4 bottom-44 z-30 flex flex-col items-end justify-end lg:right-6 lg:bottom-24">
                {/* Kept mounted while closed, so the conversation survives closing and reopening the overlay. */}
                <section
                    id={panelId}
                    aria-label="AI Help Assistant"
                    hidden={!isOpen}
                    onKeyDown={onKeyDown}
                    className="ds-surface ds-surface--chrome pointer-events-auto flex h-136 max-h-full w-full flex-col overflow-hidden shadow-panel sm:w-md"
                >
                    <header className="flex items-center justify-between gap-2 border-b border-border p-2 pl-4">
                        <h2 className="min-w-0 font-semibold">AI Help Assistant</h2>
                        <button
                            type="button"
                            className="ds-btn ds-btn--text ds-btn--icon"
                            aria-label="Close assistant"
                            onClick={close}
                        >
                            <X aria-hidden="true" />
                        </button>
                    </header>
                    {children}
                </section>
            </div>

            <button
                ref={buttonRef}
                type="button"
                onClick={() => setIsOpen((prev) => !prev)}
                aria-expanded={isOpen}
                aria-controls={panelId}
                aria-label={isOpen ? 'Close assistant' : 'Open assistant'}
                className="ds-btn ds-btn--primary fixed right-4 bottom-28 z-30 size-14 rounded-chip p-0 shadow-panel lg:right-6 lg:bottom-6"
            >
                {isOpen ? <X aria-hidden="true" /> : <BotMessageSquare aria-hidden="true" />}
            </button>
        </>
    )
}
