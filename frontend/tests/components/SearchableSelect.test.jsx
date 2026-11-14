/* AI Assistance Disclosure:
 * Tool: Codex (model: GPT-6), date: 2026-11-08
 * Scope: Tests for searchable dropdowns. No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 * Scope (2026-11-08): Tested dismissal and live selection display.
 * Author review: Congchen
 */
import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { it, expect } from 'vitest'
import SearchableSelect from '../../src/components/SearchableSelect'

it('filters and selects with the keyboard', async () => {
  const user = userEvent.setup()
  function Example() {
    const [value, setValue] = useState('')
    return <SearchableSelect aria-label="Fruit" value={value} onChange={(e) => setValue(e.target.value)}><option value="">Choose</option><option value="a">Apple</option><option value="b">Banana</option></SearchableSelect>
  }
  render(<Example />)
  const input = screen.getByRole('combobox', { name: 'Fruit' })
  await user.click(input)
  await user.type(input, 'ban')
  expect(screen.queryByRole('option', { name: 'Apple' })).not.toBeInTheDocument()
  await user.keyboard('{ArrowDown}{Enter}')
  expect(input).toHaveValue('Banana')
})

it('supports multiple checked options', async () => {
  const user = userEvent.setup()
  function Example() {
    const [value, setValue] = useState([])
    return <SearchableSelect multiple aria-label="Actions" value={value} onChange={(e) => setValue(Array.from(e.target.selectedOptions, (o) => o.value))}><option value="a">Apple</option><option value="b">Banana</option></SearchableSelect>
  }
  render(<Example />)
  const input = screen.getByRole('combobox', { name: 'Actions' })
  await user.click(input)
  await user.click(screen.getByRole('checkbox', { name: 'Apple' }))
  await user.type(input, 'ban')
  await user.click(screen.getByRole('checkbox', { name: 'Banana' }))
  expect(screen.getByRole('checkbox', { name: 'Banana' })).toBeChecked()
})

it('keeps a single selection visible and closes inside a label', async () => {
  const user = userEvent.setup()
  function Example() {
    const [value, setValue] = useState('A-Z')
    return <label>Sort<SearchableSelect value={value} onChange={(e) => setValue(e.target.value)}><option>A-Z</option><option>Z-A</option></SearchableSelect></label>
  }
  render(<Example />)
  const input = screen.getByRole('combobox', { name: 'Sort' })
  await user.click(input)
  await user.click(screen.getByRole('option', { name: 'Z-A' }))
  expect(input).toHaveValue('Z-A')
  expect(input).toHaveAttribute('aria-expanded', 'false')
})

it('shows current multi-selections while keeping the search open', async () => {
  const user = userEvent.setup()
  function Example() {
    const [value, setValue] = useState([])
    return <SearchableSelect multiple aria-label="Actions" value={value} onChange={(e) => setValue(Array.from(e.target.selectedOptions, (o) => o.value))}><option value="a">Apple</option><option value="b">Banana</option></SearchableSelect>
  }
  render(<Example />)
  const input = screen.getByRole('combobox', { name: 'Actions' })
  await user.click(input)
  await user.click(screen.getByRole('checkbox', { name: 'Apple' }))
  expect(screen.getByText('Selected: Apple')).toBeInTheDocument()
  await user.type(input, 'ban')
  await user.click(screen.getByRole('checkbox', { name: 'Banana' }))
  expect(screen.getByText('Selected: Apple, Banana')).toBeInTheDocument()
  expect(input).toHaveAttribute('aria-expanded', 'true')
})
