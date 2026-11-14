/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-04
 * Scope: Tests for ActionMenu (per instructions.md Stage 21a's Tests section): portal
 *        rendering, the below/above flip logic (getBoundingClientRect and innerHeight mocked),
 *        and every close path (outside click, Escape + focus return, item selection, resize,
 *        scroll in the capture phase, and only one menu open at a time across two instances).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ActionMenu from '../../src/components/ActionMenu'

function rect({ top = 0, bottom = 0, left = 0, right = 0, width = 0, height = 0 } = {}) {
  return { top, bottom, left, right, width, height, x: left, y: top, toJSON() {} }
}

function mockRects(triggerRect, menuRect) {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockImplementationOnce(() => triggerRect)
    .mockImplementationOnce(() => menuRect)
}

beforeEach(() => {
  Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ActionMenu (Stage 21a)', () => {
  it('portals the open menu to document.body rather than nesting it under the trigger', () => {
    mockRects(rect({ top: 100, bottom: 120, right: 200 }), rect({ width: 180, height: 80 }))
    const { container } = render(
      <ActionMenu
        ariaLabel="Actions for alice"
        trigger={<span>•••</span>}
        items={[{ label: 'Suspend', onSelect: vi.fn() }]}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Actions for alice' }))

    const menu = screen.getByRole('menu')
    expect(container.contains(menu)).toBe(false)
    expect(document.body.contains(menu)).toBe(true)
  })

  it('places the menu below the trigger when it fits in the viewport', () => {
    mockRects(rect({ top: 100, bottom: 120, right: 200 }), rect({ width: 180, height: 80 }))
    render(
      <ActionMenu
        ariaLabel="Actions for alice"
        trigger={<span>•••</span>}
        items={[{ label: 'Suspend', onSelect: vi.fn() }]}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Actions for alice' }))

    const menu = screen.getByRole('menu')
    expect(menu.style.top).toBe('124px')
    expect(menu.style.left).toBe('20px')
  })

  it('flips above the trigger when the menu would overflow the viewport bottom', () => {
    mockRects(rect({ top: 700, bottom: 720, right: 200 }), rect({ width: 180, height: 100 }))
    render(
      <ActionMenu
        ariaLabel="Actions for alice"
        trigger={<span>•••</span>}
        items={[{ label: 'Suspend', onSelect: vi.fn() }]}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Actions for alice' }))

    const menu = screen.getByRole('menu')
    expect(menu.style.top).toBe('596px')
  })

  it('clamps the left position to at least 8px', () => {
    mockRects(rect({ top: 100, bottom: 120, right: 50 }), rect({ width: 180, height: 80 }))
    render(
      <ActionMenu
        ariaLabel="Actions for alice"
        trigger={<span>•••</span>}
        items={[{ label: 'Suspend', onSelect: vi.fn() }]}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Actions for alice' }))

    expect(screen.getByRole('menu').style.left).toBe('8px')
  })

  it('closes on an outside mousedown', () => {
    mockRects(rect({ top: 100, bottom: 120, right: 200 }), rect({ width: 180, height: 80 }))
    render(
      <ActionMenu
        ariaLabel="Actions for alice"
        trigger={<span>•••</span>}
        items={[{ label: 'Suspend', onSelect: vi.fn() }]}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Actions for alice' }))
    expect(screen.getByRole('menu')).toBeInTheDocument()

    fireEvent.mouseDown(document.body)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('closes on Escape and returns focus to the trigger', () => {
    mockRects(rect({ top: 100, bottom: 120, right: 200 }), rect({ width: 180, height: 80 }))
    render(
      <ActionMenu
        ariaLabel="Actions for alice"
        trigger={<span>•••</span>}
        items={[{ label: 'Suspend', onSelect: vi.fn() }]}
      />,
    )

    const triggerButton = screen.getByRole('button', { name: 'Actions for alice' })
    fireEvent.click(triggerButton)
    expect(screen.getByRole('menu')).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(triggerButton).toHaveFocus()
  })

  it('closes on item selection and calls the handler exactly once', () => {
    mockRects(rect({ top: 100, bottom: 120, right: 200 }), rect({ width: 180, height: 80 }))
    const onSelect = vi.fn()
    render(
      <ActionMenu
        ariaLabel="Actions for alice"
        trigger={<span>•••</span>}
        items={[{ label: 'Suspend', onSelect }]}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Actions for alice' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Suspend' }))

    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('closes on window resize', () => {
    mockRects(rect({ top: 100, bottom: 120, right: 200 }), rect({ width: 180, height: 80 }))
    render(
      <ActionMenu
        ariaLabel="Actions for alice"
        trigger={<span>•••</span>}
        items={[{ label: 'Suspend', onSelect: vi.fn() }]}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Actions for alice' }))
    fireEvent(window, new Event('resize'))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('closes on scroll, including a scroll that starts inside the table (capture phase)', () => {
    mockRects(rect({ top: 100, bottom: 120, right: 200 }), rect({ width: 180, height: 80 }))
    const { container } = render(
      <div>
        <div data-testid="table-wrapper">
          <ActionMenu
            ariaLabel="Actions for alice"
            trigger={<span>•••</span>}
            items={[{ label: 'Suspend', onSelect: vi.fn() }]}
          />
        </div>
      </div>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Actions for alice' }))
    expect(screen.getByRole('menu')).toBeInTheDocument()

    fireEvent.scroll(container.querySelector('[data-testid="table-wrapper"]'))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('keeps only one menu open at a time across two instances', () => {
    mockRects(rect({ top: 100, bottom: 120, right: 200 }), rect({ width: 180, height: 80 }))
    mockRects(rect({ top: 200, bottom: 220, right: 200 }), rect({ width: 180, height: 80 }))
    render(
      <div>
        <ActionMenu
          ariaLabel="Actions for alice"
          trigger={<span>•••</span>}
          items={[{ label: 'Suspend', onSelect: vi.fn() }]}
        />
        <ActionMenu
          ariaLabel="Actions for bob"
          trigger={<span>•••</span>}
          items={[{ label: 'Suspend', onSelect: vi.fn() }]}
        />
      </div>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Actions for alice' }))
    expect(screen.getAllByRole('menu')).toHaveLength(1)

    // A real click starts with a mousedown, which is what closes the other open menu before
    // this one's click handler toggles it open — fire both to match that native event order.
    const bobTrigger = screen.getByRole('button', { name: 'Actions for bob' })
    fireEvent.mouseDown(bobTrigger)
    fireEvent.click(bobTrigger)
    expect(screen.getAllByRole('menu')).toHaveLength(1)
    expect(screen.getByRole('menu')).toHaveTextContent('Suspend')
  })

  it('renders nothing when there are no items', () => {
    render(<ActionMenu ariaLabel="Actions for alice" trigger={<span>•••</span>} items={[]} />)
    expect(screen.queryByRole('button', { name: 'Actions for alice' })).not.toBeInTheDocument()
  })
})
