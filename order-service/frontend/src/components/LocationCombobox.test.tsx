import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { CampusLocation } from '../api/sharedApi'
import { LocationCombobox } from './LocationCombobox'

const LOCATIONS: CampusLocation[] = [
  { id: 'pc', name: 'Printers@PCCommons', building: 'PC Commons', floor: '1' },
  { id: 'pgp', name: 'PGP Foyer', building: 'PGP', floor: null },
  { id: 'com1', name: 'COM1 Print Shop', building: 'COM1', floor: '2' },
]

function Picker({
  onChange = vi.fn(),
  initial = '',
  locations,
  loading = false,
}: {
  onChange?: (value: string) => void
  initial?: string
  locations?: CampusLocation[] | undefined
  loading?: boolean
}) {
  const [value, setValue] = useState(initial)
  return (
    <>
      <label htmlFor="pickup">Pickup location</label>
      <LocationCombobox
        id="pickup"
        invalid={false}
        locations={locations === undefined && !loading ? LOCATIONS : locations}
        onChange={(next) => {
          setValue(next)
          onChange(next)
        }}
        value={value}
      />
      <button type="button">Next field</button>
    </>
  )
}

describe('LocationCombobox', () => {
  it('opens a list with "Choose a location" first and every location', async () => {
    const user = userEvent.setup()
    render(<Picker />)

    await user.click(screen.getByRole('combobox', { name: 'Pickup location' }))

    const options = screen.getAllByRole('option')
    expect(options.map((option) => option.textContent)).toEqual([
      'Choose a location',
      'Printers@PCCommons · PC Commons, level 1',
      'PGP Foyer · PGP',
      'COM1 Print Shop · COM1, level 2',
    ])
    expect(screen.getByRole('combobox')).toHaveAttribute(
      'aria-expanded',
      'true',
    )
  })

  it('filters by name or building as you type and picks with a click', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<Picker onChange={onChange} />)

    const input = screen.getByRole('combobox', { name: 'Pickup location' })
    await user.type(input, 'print')

    expect(
      screen.getAllByRole('option').map((option) => option.textContent),
    ).toEqual([
      'Printers@PCCommons · PC Commons, level 1',
      'COM1 Print Shop · COM1, level 2',
    ])
    await user.click(screen.getByRole('option', { name: /COM1 Print Shop/ }))

    expect(onChange).toHaveBeenLastCalledWith('com1')
    expect(input).toHaveValue('COM1 Print Shop · COM1, level 2')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('says so when nothing matches', async () => {
    const user = userEvent.setup()
    render(<Picker />)

    await user.type(screen.getByRole('combobox'), 'library')

    expect(screen.getByText('No matching locations')).toBeInTheDocument()
    expect(screen.queryAllByRole('option')).toHaveLength(0)
  })

  it('works with the keyboard: arrows move, Enter picks, Escape closes', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<Picker onChange={onChange} />)

    const input = screen.getByRole('combobox')
    input.focus()
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    await user.keyboard('{ArrowDown}{ArrowDown}')
    expect(input).toHaveAttribute(
      'aria-activedescendant',
      screen.getAllByRole('option')[2]?.id,
    )
    await user.keyboard('{Enter}')
    expect(onChange).toHaveBeenLastCalledWith('pgp')

    await user.keyboard('{ArrowDown}')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(input).toHaveValue('PGP Foyer · PGP')
  })

  it('starts a new search when you type over a chosen location', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<Picker initial="pgp" onChange={onChange} />)

    const input = screen.getByRole('combobox')
    input.focus()
    await user.keyboard('com1')

    expect(input).toHaveValue('com1')
    expect(
      screen.getAllByRole('option').map((option) => option.textContent),
    ).toEqual(['COM1 Print Shop · COM1, level 2'])
    await user.keyboard('{Enter}')
    expect(onChange).toHaveBeenLastCalledWith('com1')
  })

  it('can be cleared back to no location', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<Picker initial="pc" onChange={onChange} />)

    await user.click(screen.getByRole('combobox'))
    await user.click(screen.getByRole('option', { name: 'Choose a location' }))

    expect(onChange).toHaveBeenLastCalledWith('')
    expect(screen.getByRole('combobox')).toHaveValue('')
  })

  it('leaving the field keeps the chosen location and drops a half-typed search', async () => {
    const user = userEvent.setup()
    render(<Picker initial="pgp" />)

    await user.click(screen.getByRole('combobox'))
    await user.type(screen.getByRole('combobox'), 'com')
    await user.tab()

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(screen.getByRole('combobox')).toHaveValue('PGP Foyer · PGP')
  })

  it('is disabled while the locations load', () => {
    render(<Picker loading />)

    expect(screen.getByRole('combobox')).toBeDisabled()
    expect(screen.getByRole('combobox')).toHaveAttribute(
      'placeholder',
      'Loading locations…',
    )
  })
})
