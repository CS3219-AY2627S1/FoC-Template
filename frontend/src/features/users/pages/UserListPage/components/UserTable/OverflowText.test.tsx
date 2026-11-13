import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { OverflowText } from './OverflowText'

afterEach(() => vi.restoreAllMocks())

const setElementWidths = (scrollWidth: number, clientWidth: number) => {
  vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(
    scrollWidth,
  )
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(
    clientWidth,
  )
}

test('shows the full value on hover or press when text is clipped', async () => {
  setElementWidths(300, 120)
  const user = userEvent.setup()
  render(<OverflowText value="A long faculty name" />)

  const trigger = screen.getByText('A long faculty name')
  await waitFor(() => expect(trigger).toHaveAttribute('tabindex', '0'))

  await user.hover(trigger)
  expect(await screen.findByRole('tooltip')).toHaveTextContent(
    'A long faculty name',
  )

  await user.unhover(trigger)
  await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull())

  await user.click(trigger)
  expect(await screen.findByRole('tooltip')).toHaveTextContent(
    'A long faculty name',
  )
})

test('leaves values alone when they fit', async () => {
  setElementWidths(120, 120)
  const user = userEvent.setup()
  render(<OverflowText value="Short value" />)

  const value = screen.getByText('Short value')
  expect(value).not.toHaveAttribute('tabindex')

  await user.click(value)
  expect(screen.queryByRole('tooltip')).toBeNull()
})
